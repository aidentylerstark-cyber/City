import { randomUUID } from 'node:crypto'

import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { deriveVerificationCode, normalizeVerificationCode, sha256 } from '@/lib/crypto'
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
 *
 * The plaintext code is never stored and never held in memory. It is derived
 * on demand from the row id and AUTH_SECRET, so any instance can reproduce it
 * while nobody holding only the database can. That matters beyond tidiness:
 * on serverless the endpoint that issues a code and the bridge endpoint that
 * delivers it run in separate processes with no shared state.
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

  // Generate the id up front so the code can be derived from it, rather than
  // stored anywhere.
  const id = randomUUID()
  const code = deriveVerificationCode(env.authSecret, id)

  const row = await db.verificationCode.create({
    data: {
      id,
      slUsername,
      purpose: args.purpose,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      requestIp: args.requestIp ?? null,
    },
    select: { id: true, slUsername: true, expiresAt: true },
  })

  return row
}

export type DeliveryClaim =
  | { ok: true; code: string; codeId: string; purpose: VerificationPurpose }
  | { ok: false; reason: 'no_pending_code' | 'already_delivered' }

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

  await db.verificationCode.update({
    where: { id: row.id },
    data: {
      deliveredAt: new Date(),
      deliveredBy: args.objectKey,
      resolvedSlUuid: args.slUuid,
      resolvedDisplayName: args.displayName ?? null,
    },
  })

  return {
    ok: true,
    code: deriveVerificationCode(env.authSecret, row.id),
    codeId: row.id,
    purpose: row.purpose,
  }
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
