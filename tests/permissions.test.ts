import { describe, expect, it } from 'vitest'

import {
  ALL_PERMISSIONS,
  SYSTEM_ROLES,
  bestPriority,
  canManageRole,
  effectivePermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from '@/lib/permissions'

describe('hasPermission', () => {
  it('matches an exact grant', () => {
    expect(hasPermission(['citizens.view'], 'citizens.view')).toBe(true)
    expect(hasPermission(['citizens.view'], 'citizens.edit')).toBe(false)
  })

  it('honours the owner wildcard', () => {
    for (const key of ALL_PERMISSIONS) {
      expect(hasPermission(['*'], key)).toBe(true)
    }
  })

  it('expands a domain wildcard to that domain only', () => {
    expect(hasPermission(['citizens.*'], 'citizens.delete')).toBe(true)
    expect(hasPermission(['citizens.*'], 'warrants.issue')).toBe(false)
  })

  it('grants nothing on an empty set', () => {
    expect(hasPermission([], 'citizens.view')).toBe(false)
  })
})

describe('hasAnyPermission / hasAllPermissions', () => {
  it('behave as their names promise', () => {
    expect(hasAnyPermission(['citizens.view'], ['citizens.view', 'warrants.issue'])).toBe(true)
    expect(hasAllPermissions(['citizens.view'], ['citizens.view', 'warrants.issue'])).toBe(false)
    expect(hasAllPermissions(['*'], ['citizens.view', 'warrants.issue'])).toBe(true)
  })
})

describe('effectivePermissions', () => {
  it('unions roles and de-duplicates', () => {
    const result = effectivePermissions([
      { permissions: ['citizens.view', 'dispatch.view'] },
      { permissions: ['dispatch.view', 'reports.write'] },
    ])
    expect(new Set(result)).toEqual(new Set(['citizens.view', 'dispatch.view', 'reports.write']))
  })
})

describe('role hierarchy', () => {
  it('lets a higher role manage a lower one, never the reverse or an equal', () => {
    expect(canManageRole(0, 10)).toBe(true)
    expect(canManageRole(10, 0)).toBe(false)
    expect(canManageRole(10, 10)).toBe(false)
  })

  it('treats a member with no roles as outranked by everything', () => {
    expect(bestPriority([])).toBe(Number.MAX_SAFE_INTEGER)
    expect(canManageRole(bestPriority([]), 100)).toBe(false)
  })

  it('takes the strongest role when a member holds several', () => {
    expect(bestPriority([{ priority: 100 }, { priority: 10 }])).toBe(10)
  })
})

describe('system roles', () => {
  it('gives the wildcard to Owner and nobody else', () => {
    const withWildcard = SYSTEM_ROLES.filter((role) =>
      (role.permissions as readonly string[]).includes('*'),
    )
    expect(withWildcard.map((role) => role.name)).toEqual(['Owner'])
  })

  it('leaves exactly one default role for new members', () => {
    expect(SYSTEM_ROLES.filter((role) => role.isDefault)).toHaveLength(1)
  })

  it('never lets Administrator reach town.delete', () => {
    const admin = SYSTEM_ROLES.find((role) => role.name === 'Administrator')!
    expect(hasPermission([...admin.permissions], 'town.delete')).toBe(false)
    expect(hasPermission([...admin.permissions], 'town.manage')).toBe(true)
  })
})
