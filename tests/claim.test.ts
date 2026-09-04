import { describe, expect, it, vi } from 'vitest'

process.env.AUTH_SECRET = 'test-auth-secret'

const { issueClaim, readClaim } = await import('@/lib/auth/claim')

describe('claim tokens', () => {
  it('round-trips a valid claim', () => {
    const token = issueClaim({ avatarId: 'av_1', slUsername: 'john.doe', purpose: 'SIGNUP' })
    expect(readClaim(token)).toMatchObject({
      avatarId: 'av_1',
      slUsername: 'john.doe',
      purpose: 'SIGNUP',
    })
  })

  it('rejects a tampered payload', () => {
    const token = issueClaim({ avatarId: 'av_1', slUsername: 'john.doe', purpose: 'SIGNUP' })
    const [body, signature] = token.split('.')

    const forgedBody = Buffer.from(
      JSON.stringify({
        avatarId: 'av_victim',
        slUsername: 'someone.else',
        purpose: 'SIGNUP',
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
      'utf8',
    ).toString('base64url')

    expect(readClaim(`${forgedBody}.${signature}`)).toBeNull()
    expect(readClaim(`${body}.${'0'.repeat(64)}`)).toBeNull()
  })

  it('rejects garbage', () => {
    expect(readClaim('')).toBeNull()
    expect(readClaim('nodot')).toBeNull()
    expect(readClaim('....')).toBeNull()
  })

  it('rejects an expired claim', () => {
    const token = issueClaim({ avatarId: 'av_1', slUsername: 'john.doe', purpose: 'SIGNUP' })

    // 15-minute TTL; jump past it.
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 16 * 60 * 1000)
    expect(readClaim(token)).toBeNull()
    vi.useRealTimers()
  })
})
