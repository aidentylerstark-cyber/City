import { z } from 'zod'

import { db } from '@/lib/db'
import { clientIp, jsonError, jsonOk, parseBody } from '@/lib/http'
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { verifyPassword } from '@/lib/crypto'
import { createSession, setSessionCookie } from '@/lib/auth/session'
import { normalizeSlUsername } from '@/lib/sl/username'

const schema = z.object({
  /** Email, City Link username, or SL username — all three are accepted. */
  identifier: z.string().min(2).max(200),
  password: z.string().min(1).max(200),
})

export async function POST(request: Request) {
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const ip = clientIp(request)
  const identifier = body.data.identifier.trim()

  const limit = consumeRateLimit(
    `login:${ip}:${identifier.toLowerCase()}`,
    RATE_LIMITS.login.limit,
    RATE_LIMITS.login.windowMs,
  )
  if (!limit.allowed) {
    return jsonError(429, 'rate_limited', 'Too many sign-in attempts. Wait a few minutes.')
  }

  const account = await db.account.findFirst({
    where: {
      OR: [
        { email: identifier.toLowerCase() },
        { username: identifier },
        { slAvatar: { slUsername: normalizeSlUsername(identifier) } },
      ],
    },
    select: { id: true, passwordHash: true, status: true },
  })

  // Always run a hash comparison, even with no account, so a missing account
  // and a wrong password take the same amount of time.
  const dummyHash =
    'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
  const valid = await verifyPassword(body.data.password, account?.passwordHash ?? dummyHash)

  if (!account || !valid) {
    return jsonError(401, 'invalid_credentials', 'That sign-in did not match our records.')
  }

  if (account.status !== 'ACTIVE') {
    return jsonError(403, 'account_disabled', 'That account is suspended. Contact City Link support.')
  }

  const session = await createSession({
    accountId: account.id,
    userAgent: request.headers.get('user-agent'),
    ip,
  })
  await setSessionCookie(session.token, session.expiresAt)

  await db.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } })

  return jsonOk({ ok: true, next: '/towns' })
}
