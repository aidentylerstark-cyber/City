import { z } from 'zod'

import { db } from '@/lib/db'
import { clientIp, jsonError, jsonOk, parseBody } from '@/lib/http'
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { normalizeSlUsername } from '@/lib/sl/username'
import { confirmVerificationCode } from '@/lib/auth/verification'
import { issueClaim } from '@/lib/auth/claim'

const schema = z.object({
  slUsername: z.string().min(2).max(63),
  code: z.string().min(4).max(16),
  purpose: z.enum(['SIGNUP', 'LOGIN_RECOVERY', 'RELINK']).default('SIGNUP'),
})

const FAILURE_MESSAGES: Record<string, string> = {
  not_found: 'No pending code for that avatar. Request a new one.',
  expired: 'That code has expired. Request a new one.',
  not_delivered: 'That code has not been delivered yet. Touch a City Link terminal in-world first.',
  too_many_attempts: 'Too many incorrect attempts. Request a new code.',
  bad_code: 'That code is not right.',
}

/**
 * Step 2: redeem the code. Success mints a short-lived claim token that the
 * account-details form exchanges for a real account.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const slUsername = normalizeSlUsername(body.data.slUsername)
  const ip = clientIp(request)

  const limit = consumeRateLimit(
    `verify:confirm:${ip}:${slUsername}`,
    RATE_LIMITS.codeVerify.limit,
    RATE_LIMITS.codeVerify.windowMs,
  )
  if (!limit.allowed) {
    return jsonError(429, 'rate_limited', 'Too many attempts. Wait a few minutes and try again.')
  }

  const result = await confirmVerificationCode({
    slUsername,
    code: body.data.code,
    purpose: body.data.purpose,
  })

  if (!result.ok) {
    const message = FAILURE_MESSAGES[result.reason] ?? 'Verification failed.'
    return jsonError(400, result.reason, message, {
      attemptsRemaining: result.attemptsRemaining,
    })
  }

  // Now that the caller has proved they own the avatar, it is safe to tell them
  // whether it already has an account.
  const existingAccount = await db.account.findUnique({
    where: { slAvatarId: result.avatarId },
    select: { id: true, username: true, email: true },
  })

  const claim = issueClaim({
    avatarId: result.avatarId,
    slUsername: result.slUsername,
    purpose: body.data.purpose,
  })

  return jsonOk({
    verified: true,
    slUsername: result.slUsername,
    slUuid: result.slUuid,
    claim,
    /** True when the next step is "set a new password", not "create an account". */
    accountExists: Boolean(existingAccount),
    existingUsername: existingAccount?.username ?? null,
  })
}
