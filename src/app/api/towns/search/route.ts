import { jsonError, jsonOk, clientIp } from '@/lib/http'
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getCurrentUser } from '@/lib/auth/session'
import { searchTowns } from '@/lib/towns/service'

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthorized', 'Sign in first.')

  const limit = consumeRateLimit(
    `towns:search:${clientIp(request)}`,
    RATE_LIMITS.townAction.limit,
    RATE_LIMITS.townAction.windowMs,
  )
  if (!limit.allowed) return jsonError(429, 'rate_limited', 'Slow down a moment.')

  const url = new URL(request.url)
  const towns = await searchTowns({
    accountId: user.account.id,
    query: url.searchParams.get('q') ?? undefined,
  })

  return jsonOk({ towns })
}
