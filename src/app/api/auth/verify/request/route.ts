import { z } from 'zod'

import { db } from '@/lib/db'
import { clientIp, jsonError, jsonOk, parseBody } from '@/lib/http'
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { isValidSlUsername, normalizeSlUsername, prettySlUsername } from '@/lib/sl/username'
import { issueVerificationCode } from '@/lib/auth/verification'

const schema = z.object({
  slUsername: z.string().min(2).max(63),
  purpose: z.enum(['SIGNUP', 'LOGIN_RECOVERY', 'RELINK']).default('SIGNUP'),
})

/**
 * Step 1 of signup: "I am john.doe."
 *
 * We queue a code and say nothing about whether that avatar already has a City
 * Link account. Revealing it here would turn this endpoint into an account
 * oracle, and there is no need — the truth surfaces at confirm time, to someone
 * who has already proved they control the avatar.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const slUsername = normalizeSlUsername(body.data.slUsername)

  if (!isValidSlUsername(slUsername)) {
    return jsonError(
      400,
      'invalid_username',
      'That does not look like a Second Life username. Use the login name, like "john.doe".',
    )
  }

  const ip = clientIp(request)
  const byIp = consumeRateLimit(`verify:req:ip:${ip}`, RATE_LIMITS.codeRequest.limit, RATE_LIMITS.codeRequest.windowMs)
  const byName = consumeRateLimit(
    `verify:req:name:${slUsername}`,
    RATE_LIMITS.codeRequest.limit,
    RATE_LIMITS.codeRequest.windowMs,
  )

  if (!byIp.allowed || !byName.allowed) {
    const retryAfter = Math.max(byIp.retryAfterSeconds, byName.retryAfterSeconds)
    return jsonError(
      429,
      'rate_limited',
      `Too many code requests. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
    )
  }

  const code = await issueVerificationCode({ slUsername, purpose: body.data.purpose, requestIp: ip })

  return jsonOk({
    requestId: code.id,
    slUsername,
    legacyName: prettySlUsername(slUsername),
    expiresAt: code.expiresAt.toISOString(),
    instructions:
      'Touch any City Link verification terminal in Second Life, or say "!citylink" in range of one. It will IM you a 6-character code.',
  })
}

/**
 * Polled by the signup screen while it waits for the in-world object to hand
 * the code over. Returns only whether delivery happened — never the code.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const requestId = url.searchParams.get('requestId')
  if (!requestId) return jsonError(400, 'missing_request_id', 'requestId is required.')

  const row = await db.verificationCode.findUnique({
    where: { id: requestId },
    select: {
      deliveredAt: true,
      consumedAt: true,
      expiresAt: true,
      resolvedDisplayName: true,
    },
  })

  if (!row) return jsonError(404, 'not_found', 'That verification request no longer exists.')

  return jsonOk({
    delivered: Boolean(row.deliveredAt),
    consumed: Boolean(row.consumedAt),
    expired: row.expiresAt <= new Date(),
    displayName: row.resolvedDisplayName,
  })
}
