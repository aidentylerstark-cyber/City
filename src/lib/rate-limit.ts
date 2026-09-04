/**
 * Fixed-window rate limiting, in memory.
 *
 * Deliberately simple and deliberately per-instance. The auth flow leans on it
 * to make code-guessing and username-enumeration expensive, not impossible —
 * the real guards are the hashed codes, the attempt counter on the code row,
 * and the constant-time comparisons. Swap the Map for Redis behind
 * `consumeRateLimit` when you run more than one node.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey)
    }
  }

  let bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }

  bucket.count += 1

  const allowed = bucket.count <= limit
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

export const RATE_LIMITS = {
  /** Requesting a code for an SL username. */
  codeRequest: { limit: 5, windowMs: 15 * 60 * 1000 },
  /** Submitting a code. */
  codeVerify: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** Password login. */
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** Anything an in-world object calls. */
  bridge: { limit: 60, windowMs: 60 * 1000 },
  /** Town search and join requests. */
  townAction: { limit: 30, windowMs: 60 * 1000 },
} as const
