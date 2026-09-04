import { describe, expect, it } from 'vitest'

import { isValidSlUsername, normalizeSlUsername, toLegacyName } from '@/lib/sl/username'

describe('normalizeSlUsername', () => {
  it('lowercases and trims', () => {
    expect(normalizeSlUsername('  John.Doe  ')).toBe('john.doe')
  })

  it('accepts the legacy "First Last" form people paste out of habit', () => {
    expect(normalizeSlUsername('John Doe')).toBe('john.doe')
  })

  it('folds the implicit Resident surname, so both forms are one identity', () => {
    expect(normalizeSlUsername('johndoe.resident')).toBe('johndoe')
    expect(normalizeSlUsername('JohnDoe Resident')).toBe('johndoe')
    expect(normalizeSlUsername('johndoe')).toBe('johndoe')
  })
})

describe('isValidSlUsername', () => {
  it('accepts real username shapes', () => {
    expect(isValidSlUsername('john.doe')).toBe(true)
    expect(isValidSlUsername('johndoe')).toBe(true)
    expect(isValidSlUsername('john-doe.smith')).toBe(true)
    expect(isValidSlUsername('a1')).toBe(true)
  })

  it('rejects shapes the grid never issues', () => {
    expect(isValidSlUsername('john..doe')).toBe(false)
    expect(isValidSlUsername('.johndoe')).toBe(false)
    expect(isValidSlUsername('john doe smith')).toBe(false)
    expect(isValidSlUsername('john@doe')).toBe(false)
    expect(isValidSlUsername('a')).toBe(false)
    expect(isValidSlUsername('-john')).toBe(false)
  })
})

describe('toLegacyName', () => {
  it('renders both name systems the way the viewer does', () => {
    expect(toLegacyName('john.doe')).toBe('John Doe')
    expect(toLegacyName('johndoe')).toBe('Johndoe Resident')
  })
})
