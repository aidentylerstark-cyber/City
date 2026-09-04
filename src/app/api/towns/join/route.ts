import { z } from 'zod'

import { clientIp, jsonError, jsonOk, parseBody } from '@/lib/http'
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getCurrentUser } from '@/lib/auth/session'
import { joinOrRequest } from '@/lib/towns/service'

const schema = z.object({
  townId: z.string().min(1),
  message: z.string().max(1000).optional(),
})

const OUTCOME_COPY: Record<string, string> = {
  joined: 'Welcome aboard.',
  requested: 'Request sent. A town administrator will review it.',
  already_member: 'You are already a member of this town.',
  already_pending: 'You already have a request waiting on this town.',
  invite_only: 'This town admits members by invite only.',
  not_found: 'That town no longer exists.',
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthorized', 'Sign in first.')

  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const limit = consumeRateLimit(
    `towns:join:${clientIp(request)}:${user.account.id}`,
    RATE_LIMITS.townAction.limit,
    RATE_LIMITS.townAction.windowMs,
  )
  if (!limit.allowed) return jsonError(429, 'rate_limited', 'Slow down a moment.')

  const outcome = await joinOrRequest({
    accountId: user.account.id,
    townId: body.data.townId,
    message: body.data.message,
  })

  if (outcome.status === 'not_found') {
    return jsonError(404, 'not_found', OUTCOME_COPY.not_found!)
  }

  return jsonOk({ ...outcome, message: OUTCOME_COPY[outcome.status] ?? '' })
}
