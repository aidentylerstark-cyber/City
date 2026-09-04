import { describe, expect, it } from 'vitest'

import { consumeRateLimit } from '@/lib/rate-limit'

describe('consumeRateLimit', () => {
  it('allows up to the limit, then refuses', () => {
    const key = `test-${Math.random()}`
    for (let i = 0; i < 3; i++) {
      expect(consumeRateLimit(key, 3, 60_000).allowed).toBe(true)
    }
    expect(consumeRateLimit(key, 3, 60_000).allowed).toBe(false)
  })

  it('keeps buckets independent', () => {
    const a = `a-${Math.random()}`
    const b = `b-${Math.random()}`
    consumeRateLimit(a, 1, 60_000)
    expect(consumeRateLimit(a, 1, 60_000).allowed).toBe(false)
    expect(consumeRateLimit(b, 1, 60_000).allowed).toBe(true)
  })

  it('reports how long until the window resets', () => {
    const result = consumeRateLimit(`c-${Math.random()}`, 1, 60_000)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60)
  })
})
