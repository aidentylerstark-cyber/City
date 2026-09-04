import { z } from 'zod'
import { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { clientIp, jsonError, jsonOk, parseBody } from '@/lib/http'
import { hashPassword } from '@/lib/crypto'
import { readClaim } from '@/lib/auth/claim'
import { createSession, setSessionCookie } from '@/lib/auth/session'

const schema = z.object({
  claim: z.string().min(10),
  email: z.string().email().max(200),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, and underscores only.'),
  password: z.string().min(10).max(200),
  displayName: z.string().max(60).optional(),
})

/**
 * Step 3: turn a verified avatar claim into an account, and sign in.
 *
 * The claim token is the only thing that authorises this — there is no way to
 * create an account without having redeemed an in-world code minutes earlier.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const claim = readClaim(body.data.claim)
  if (!claim) {
    return jsonError(
      401,
      'invalid_claim',
      'Your verification expired. Verify your Second Life avatar again.',
    )
  }

  if (claim.purpose !== 'SIGNUP') {
    return jsonError(400, 'wrong_claim_purpose', 'That verification was not for creating an account.')
  }

  const avatar = await db.sLAvatar.findUnique({
    where: { id: claim.avatarId },
    select: { id: true, slUsername: true, slDisplayName: true, account: { select: { id: true } } },
  })

  if (!avatar) return jsonError(404, 'avatar_missing', 'That avatar record no longer exists.')

  if (avatar.account) {
    return jsonError(
      409,
      'account_exists',
      'That avatar already has a City Link account. Sign in instead, or use "reset password".',
    )
  }

  const passwordHash = await hashPassword(body.data.password)

  let accountId: string
  try {
    const account = await db.account.create({
      data: {
        slAvatarId: avatar.id,
        email: body.data.email.toLowerCase().trim(),
        username: body.data.username.trim(),
        passwordHash,
        displayName: body.data.displayName?.trim() || avatar.slDisplayName || null,
        lastLoginAt: new Date(),
      },
      select: { id: true },
    })
    accountId = account.id
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'field'
      return jsonError(
        409,
        'already_taken',
        target.includes('email')
          ? 'That email is already in use.'
          : 'That username is already taken.',
      )
    }
    throw error
  }

  const session = await createSession({
    accountId,
    userAgent: request.headers.get('user-agent'),
    ip: clientIp(request),
  })
  await setSessionCookie(session.token, session.expiresAt)

  return jsonOk({ ok: true, accountId, next: '/towns' }, 201)
}
