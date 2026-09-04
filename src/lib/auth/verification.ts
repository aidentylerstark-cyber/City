import { db } from '@/lib/db'
import { generateVerificationCode, normalizeVerificationCode, sha256 } from '@/lib/crypto'
import { normalizeSlUsername } from '@/lib/sl/username'
import type { VerificationPurpose } from '@prisma/client'

/**
 * The in-world identity proof.
 *
 * A code issued here is worthless on its own: it is stored hashed, and it can
 * only be redeemed after an in-world object has *delivered* it to the avatar
 * named on the request. That delivery is what proves the person at the keyboard
 * controls the avatar — nobody else can touch the object as that avatar and
 * read the IM it sends back.
 *
 * The order of operations matters:
 *   request -> (object delivers, learning the UUID) -> confirm
 * A code that was never delivered can never be confirmed, so requesting codes
 * for someone else's username accomplishes nothing.
 */

export const CODE_TTL_MS = 10 * 60 * 1000
export const MAX_CODE_ATTEMPTS = 5

export type IssuedCode = {
  id: string
  slUsername: string
  expiresAt: Date
}

/**
 * Issue a code for an avatar. Any earlier unconsumed code for the same
 * username and purpose is retired first, so there is exactly one live code at
 * a time and a resent code invalidates the old one.
 */
export async function issueVerificationCode(args: {
  slUsername: string
  purpose: VerificationPurpose
  requestIp?: string | null
}): Promise<IssuedCode> {
  const slUsername = normalizeSlUsername(args.slUsername)
  const now = new Date()

  await db.verificationCode.updateMany({
    where: { slUsername, purpose: args.purpose, consumedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  })

  const code = generateVerificationCode(6)

  const row = await db.verificationCode.create({
    data: {
      slUsername,
      purpose: args.purpose,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      requestIp: args.requestIp ?? null,
    },
    select: { id: true, slUsername: true, expiresAt: true },
  })

  // The plaintext never returns to the caller and never touches the database.
  // It leaves this process in exactly one place: the signed bridge response to
  // the in-world object. See `claimCodeForDelivery`.
  pendingPlaintext.set(row.id, { code, expiresAt: row.expiresAt })
  sweepPending()

  return row
}

/**
 * Codes waiting for an in-world object to collect them.
 *
 * Held in memory, never on disk: a code at rest in the database would let
 * anyone with a read replica impersonate any avatar mid-signup. The cost is
 * that a restart drops undelivered codes — the user simply asks for a new one,
 * which is the correct trade for a ten-minute secret.
 */
const pendingPlaintext = new Map<string, { code: string; expiresAt: Date }>()

function sweepPending(): void {
  const now = Date.now()
  for (const [id, entry] of pendingPlaintext) {
    if (entry.expiresAt.getTime() <= now) pendingPlaintext.delete(id)
  }
}

export type DeliveryClaim =
  | { ok: true; code: string; codeId: string; purpose: VerificationPurpose }
  | { ok: false; reason: 'no_pending_code' | 'already_delivered' | 'expired' }

/**
 * An in-world object asks: "is there a code waiting for this avatar?"
 *
 * Called only from a signed bridge request, with a UUID and username the object
 * read off the toucher itself. Both are recorded on the code row — the UUID is
 * how we learn the avatar's permanent key.
 */
export async function claimCodeForDelivery(args: {
  slUsername: string
  slUuid: string
  displayName?: string | null
  objectKey: string
}): Promise<DeliveryClaim> {
  const slUsername = normalizeSlUsername(args.slUsername)

  const row = await db.verificationCode.findFirst({
    where: {
      slUsername,
      consumedAt: null,
      deliveredAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!row) return { ok: false, reason: 'no_pending_code' }

  const pending = pendingPlaintext.get(row.id)
  if (!pending) {
    // Server restarted between request and delivery. Retire the row so the
    // user gets a clean "request a new code" rather than a stuck one.
    await db.verificationCode.update({ where: { id: row.id }, data: { expiresAt: new Date() } })
    return { ok: false, reason: 'expired' }
  }

  await db.verificationCode.update({
    where: { id: row.id },
    data: {
      deliveredAt: new Date(),
      deliveredBy: args.objectKey,
      resolvedSlUuid: args.slUuid,
      resolvedDisplayName: args.displayName ?? null,
    },
  })

  pendingPlaintext.delete(row.id)

  return { ok: true, code: pending.code, codeId: row.id, purpose: row.purpose }
}

export type ConfirmResult =
  | {
      ok: true
      avatarId: string
      slUsername: string
      slUuid: string | null
      purpose: VerificationPurpose
    }
  | {
      ok: false
      reason: 'not_found' | 'expired' | 'not_delivered' | 'too_many_attempts' | 'bad_code'
      attemptsRemaining?: number
    }

/**
 * Redeem a code. On success the SLAvatar row is created or updated — this is
 * the only place an avatar becomes verified.
 */
export async function confirmVerificationCode(args: {
  slUsername: string
  code: string
  purpose: VerificationPurpose
}): Promise<ConfirmResult> {
  const slUsername = normalizeSlUsername(args.slUsername)
  const submitted = normalizeVerificationCode(args.code)

  const row = await db.verificationCode.findFirst({
    where: { slUsername, purpose: args.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!row) return { ok: false, reason: 'not_found' }
  if (row.expiresAt <= new Date()) return { ok: false, reason: 'expired' }
  if (!row.deliveredAt) return { ok: false, reason: 'not_delivered' }
  if (row.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' }

  if (sha256(submitted) !== row.codeHash) {
    const updated = await db.verificationCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    })
    return {
      ok: false,
      reason: 'bad_code',
      attemptsRemaining: Math.max(0, MAX_CODE_ATTEMPTS - updated.attempts),
    }
  }

  const avatar = await db.sLAvatar.upsert({
    where: { slUsername },
    create: {
      slUsername,
      slUuid: row.resolvedSlUuid,
      slDisplayName: row.resolvedDisplayName,
      lastVerified: new Date(),
    },
    update: {
      slUuid: row.resolvedSlUuid ?? undefined,
      slDisplayName: row.resolvedDisplayName ?? undefined,
      lastVerified: new Date(),
    },
  })

  await db.verificationCode.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  })

  return {
    ok: true,
    avatarId: avatar.id,
    slUsername: avatar.slUsername,
    slUuid: avatar.slUuid,
    purpose: row.purpose,
  }
}
