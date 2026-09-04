import { describe, expect, it } from 'vitest'

import {
  generateVerificationCode,
  hashPassword,
  hmacSha256,
  normalizeVerificationCode,
  safeEqual,
  verifyPassword,
} from '@/lib/crypto'

describe('password hashing', () => {
  it('round-trips a password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
    expect(await verifyPassword('wrong horse battery staple', stored)).toBe(false)
  })

  it('salts, so the same password hashes differently each time', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
  })

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('anything', '')).toBe(false)
  })

  it('normalises unicode, so the same typed password matches either encoding', async () => {
    // "é" as one code point vs. e + combining acute.
    const stored = await hashPassword('café-password')
    expect(await verifyPassword('café-password', stored)).toBe(true)
  })
})

describe('verification codes', () => {
  it('only issues characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateVerificationCode(6)).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/)
    }
  })

  it('folds the glyphs people actually mistype', () => {
    expect(normalizeVerificationCode('o1lI0')).toBe('01110')
    expect(normalizeVerificationCode('a1b-2c3')).toBe('A1B2C3')
    expect(normalizeVerificationCode(' a b c ')).toBe('ABC')
  })
})

describe('safeEqual', () => {
  it('compares equal strings as equal', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true)
  })

  it('rejects different strings, including different lengths', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false)
    expect(safeEqual('abc', 'abc123')).toBe(false)
    expect(safeEqual('', 'a')).toBe(false)
  })
})

describe('hmacSha256', () => {
  it('is stable and key-dependent', () => {
    expect(hmacSha256('k', 'payload')).toBe(hmacSha256('k', 'payload'))
    expect(hmacSha256('k', 'payload')).not.toBe(hmacSha256('k2', 'payload'))
  })
})
