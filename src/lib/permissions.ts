/**
 * Per-town permissions.
 *
 * Towns are sovereign: a role in Ashford means nothing in Rockport. A member's
 * effective permissions are the union of their roles' permission keys, plus the
 * wildcard "*" which only the Owner role carries.
 *
 * Keys are `domain.action`. A role holding "citizens.*" gets every action in
 * the citizens domain — the wildcard is expanded at check time, not at grant
 * time, so adding a new action does not silently widen existing roles unless
 * they asked for the whole domain.
 */

export const PERMISSIONS = {
  'town.manage': 'Edit town settings, branding, and join policy',
  'town.delete': 'Archive or permanently delete the town',
  'town.audit': 'Read the town audit log',

  'members.view': 'See the member roster',
  'members.invite': 'Create invite codes and approve join requests',
  'members.manage': 'Edit member titles, callsigns, and roles',
  'members.remove': 'Remove or suspend members',

  'roles.view': 'See roles and their permissions',
  'roles.manage': 'Create, edit, and delete roles',

  'citizens.view': 'Look up citizen records in this town',
  'citizens.create': 'Create citizen records',
  'citizens.edit': 'Edit citizen records',
  'citizens.delete': 'Delete citizen records',
  'citizens.flag': 'Add or clear officer-safety flags',

  'documents.view': 'View issued IDs, licenses, permits, and plates',
  'documents.issue': 'Issue new documents',
  'documents.revoke': 'Suspend or revoke issued documents',

  'vehicles.view': 'Run plates and view registrations',
  'vehicles.manage': 'Register and edit vehicles',

  'citations.view': 'View citations',
  'citations.issue': 'Write citations',
  'citations.manage': 'Void, dismiss, or mark citations paid',

  'warrants.view': 'View warrants',
  'warrants.issue': 'Issue warrants',
  'warrants.manage': 'Recall or clear warrants',

  'businesses.view': 'View business registry',
  'businesses.manage': 'Register and edit businesses',

  'dispatch.view': 'Watch the dispatch board',
  'dispatch.use': 'Update own unit status and attach to calls',
  'dispatch.manage': 'Create calls and assign any unit',

  'reports.view': 'Read reports',
  'reports.write': 'Write and submit reports',
  'reports.approve': 'Approve or reject submitted reports',
  'reports.build': 'Design report templates',

  'schedule.view': 'View the roster and shift calendar',
  'schedule.manage': 'Create and assign shifts',

  'search.global': 'Search records issued by other towns',
} as const

export type PermissionKey = keyof typeof PERMISSIONS

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[]

export const WILDCARD = '*'

/** Groups the permission picker renders as sections. */
export const PERMISSION_DOMAINS = [
  { key: 'town', label: 'Town' },
  { key: 'members', label: 'Members' },
  { key: 'roles', label: 'Roles' },
  { key: 'citizens', label: 'Citizens' },
  { key: 'documents', label: 'Documents' },
  { key: 'vehicles', label: 'Vehicles & DMV' },
  { key: 'citations', label: 'Citations' },
  { key: 'warrants', label: 'Warrants' },
  { key: 'businesses', label: 'Businesses' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'reports', label: 'Reports' },
  { key: 'schedule', label: 'Scheduling' },
  { key: 'search', label: 'Cross-town search' },
] as const

export function permissionsInDomain(domain: string): PermissionKey[] {
  return ALL_PERMISSIONS.filter((key) => key.startsWith(`${domain}.`))
}

/**
 * Does this set of granted keys satisfy `needed`?
 * Matches "*", the exact key, or the key's domain wildcard.
 */
export function hasPermission(granted: readonly string[], needed: PermissionKey): boolean {
  if (granted.includes(WILDCARD)) return true
  if (granted.includes(needed)) return true
  const domain = needed.slice(0, needed.indexOf('.'))
  return granted.includes(`${domain}.*`)
}

export function hasAnyPermission(granted: readonly string[], needed: readonly PermissionKey[]): boolean {
  return needed.some((key) => hasPermission(granted, key))
}

export function hasAllPermissions(granted: readonly string[], needed: readonly PermissionKey[]): boolean {
  return needed.every((key) => hasPermission(granted, key))
}

/** Flatten a member's roles into the set actually used for checks. */
export function effectivePermissions(roles: readonly { permissions: string[] }[]): string[] {
  const set = new Set<string>()
  for (const role of roles) for (const key of role.permissions) set.add(key)
  return [...set]
}

/**
 * The three roles every new town starts with. Owner is untouchable; the other
 * two are ordinary roles the owner can rename, re-scope, or delete.
 */
export const SYSTEM_ROLES = [
  {
    name: 'Owner',
    color: '#f59e0b',
    priority: 0,
    permissions: [WILDCARD],
    isSystem: true,
    isDefault: false,
  },
  {
    name: 'Administrator',
    color: '#8b5cf6',
    priority: 10,
    permissions: [
      'town.manage',
      'town.audit',
      'members.view',
      'members.invite',
      'members.manage',
      'members.remove',
      'roles.view',
      'roles.manage',
      'citizens.*',
      'documents.*',
      'vehicles.*',
      'citations.*',
      'warrants.*',
      'businesses.*',
      'dispatch.*',
      'reports.*',
      'schedule.*',
      'search.global',
    ],
    isSystem: true,
    isDefault: false,
  },
  {
    name: 'Member',
    color: '#64748b',
    priority: 100,
    permissions: ['members.view', 'roles.view', 'citizens.view', 'documents.view', 'dispatch.view'],
    isSystem: true,
    isDefault: true,
  },
] as const

/**
 * Role hierarchy. You may only act on a role strictly below your own best
 * (lowest-numbered) role — this is what stops an Administrator from editing
 * the Owner role or promoting themselves past it.
 */
export function canManageRole(actorBestPriority: number, targetPriority: number): boolean {
  return actorBestPriority < targetPriority
}

export function bestPriority(roles: readonly { priority: number }[]): number {
  if (roles.length === 0) return Number.MAX_SAFE_INTEGER
  return Math.min(...roles.map((role) => role.priority))
}
