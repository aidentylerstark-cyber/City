import { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { SYSTEM_ROLES, effectivePermissions, bestPriority, hasPermission } from '@/lib/permissions'
import type { PermissionKey } from '@/lib/permissions'

/** A URL-safe town slug derived from its name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || 'town'
  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = suffix === 0 ? root : `${root}-${suffix + 1}`
    const taken = await db.town.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!taken) return candidate
  }
  return `${root}-${Date.now().toString(36)}`
}

export type TownCreationCheck =
  | { allowed: true; license: { id: string; townAllowance: number }; used: number }
  | { allowed: false; reason: 'no_license' | 'allowance_reached'; used?: number; allowance?: number }

/**
 * Creating a town requires a verified product licence. The allowance is counted
 * against towns the account still owns and has not archived — deleting a town
 * frees the slot.
 */
export async function checkTownCreation(accountId: string): Promise<TownCreationCheck> {
  const license = await db.productLicense.findFirst({
    where: { accountId, status: { in: ['ACTIVE', 'DORMANT'] } },
    orderBy: { townAllowance: 'desc' },
    select: { id: true, townAllowance: true },
  })

  if (!license) return { allowed: false, reason: 'no_license' }

  const used = await db.town.count({ where: { ownerId: accountId, archivedAt: null } })

  if (used >= license.townAllowance) {
    return { allowed: false, reason: 'allowance_reached', used, allowance: license.townAllowance }
  }

  return { allowed: true, license, used }
}

/**
 * Create a town and seat its owner. Everything happens in one transaction: a
 * town without an Owner role, or with an owner who is not a member, is not a
 * state the rest of the app knows how to render.
 */
export async function createTown(args: {
  ownerId: string
  name: string
  tagline?: string | null
  description?: string | null
  region?: string | null
  timezone?: string
  accentColor?: string
  joinPolicy?: 'OPEN' | 'REQUEST' | 'INVITE'
  visibility?: 'PUBLIC' | 'UNLISTED'
}) {
  const slug = await uniqueSlug(slugify(args.name))

  return db.$transaction(async (tx) => {
    const town = await tx.town.create({
      data: {
        slug,
        name: args.name.trim(),
        tagline: args.tagline?.trim() || null,
        description: args.description?.trim() || null,
        region: args.region?.trim() || null,
        timezone: args.timezone ?? 'UTC',
        accentColor: args.accentColor ?? '#3b82f6',
        joinPolicy: args.joinPolicy ?? 'REQUEST',
        visibility: args.visibility ?? 'PUBLIC',
        ownerId: args.ownerId,
      },
    })

    await tx.role.createMany({
      data: SYSTEM_ROLES.map((role) => ({
        townId: town.id,
        name: role.name,
        color: role.color,
        priority: role.priority,
        permissions: [...role.permissions],
        isSystem: role.isSystem,
        isDefault: role.isDefault,
      })),
    })

    const ownerRole = await tx.role.findFirstOrThrow({
      where: { townId: town.id, name: 'Owner' },
      select: { id: true },
    })

    const membership = await tx.townMembership.create({
      data: { townId: town.id, accountId: args.ownerId, title: 'Owner' },
    })

    await tx.memberRole.create({
      data: { membershipId: membership.id, roleId: ownerRole.id },
    })

    await tx.department.createMany({
      data: [
        { townId: town.id, name: 'Police', kind: 'POLICE', color: '#3b82f6' },
        { townId: town.id, name: 'Fire & EMS', kind: 'FIRE', color: '#ef4444' },
        { townId: town.id, name: 'Civil', kind: 'CIVIL', color: '#10b981' },
      ],
    })

    await tx.auditLog.create({
      data: {
        townId: town.id,
        actorId: args.ownerId,
        action: 'town.create',
        targetType: 'Town',
        targetId: town.id,
        meta: { name: town.name, slug: town.slug },
      },
    })

    return town
  })
}

export type TownContext = {
  town: {
    id: string
    slug: string
    name: string
    accentColor: string
    logoUrl: string | null
    joinPolicy: string
    shareRecords: boolean
  }
  membership: {
    id: string
    characterName: string | null
    title: string | null
    callsign: string | null
  }
  permissions: string[]
  bestRolePriority: number
  isOwner: boolean
}

/**
 * Load a member's standing in a town. Returns null when the account is not an
 * active member — callers treat that identically to "town does not exist", so
 * membership is not leaked by a 403/404 difference.
 */
export async function getTownContext(
  accountId: string,
  townIdOrSlug: string,
): Promise<TownContext | null> {
  const town = await db.town.findFirst({
    where: {
      OR: [{ id: townIdOrSlug }, { slug: townIdOrSlug }],
      archivedAt: null,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      accentColor: true,
      logoUrl: true,
      joinPolicy: true,
      shareRecords: true,
      ownerId: true,
    },
  })

  if (!town) return null

  const membership = await db.townMembership.findUnique({
    where: { townId_accountId: { townId: town.id, accountId } },
    include: { roles: { include: { role: true } } },
  })

  if (!membership || membership.status !== 'ACTIVE') return null

  const roles = membership.roles.map((entry) => entry.role)

  return {
    town: {
      id: town.id,
      slug: town.slug,
      name: town.name,
      accentColor: town.accentColor,
      logoUrl: town.logoUrl,
      joinPolicy: town.joinPolicy,
      shareRecords: town.shareRecords,
    },
    membership: {
      id: membership.id,
      characterName: membership.characterName,
      title: membership.title,
      callsign: membership.callsign,
    },
    permissions: effectivePermissions(roles),
    bestRolePriority: bestPriority(roles),
    isOwner: town.ownerId === accountId,
  }
}

export function can(context: TownContext, permission: PermissionKey): boolean {
  return hasPermission(context.permissions, permission)
}

export type TownSearchResult = {
  id: string
  slug: string
  name: string
  tagline: string | null
  region: string | null
  logoUrl: string | null
  accentColor: string
  joinPolicy: string
  memberCount: number
  /** This account's standing: are they in, waiting, or neither? */
  relationship: 'member' | 'pending' | 'none'
}

/** Town directory search, used by the picker's "find a town" panel. */
export async function searchTowns(args: {
  accountId: string
  query?: string
  limit?: number
}): Promise<TownSearchResult[]> {
  const limit = Math.min(args.limit ?? 20, 50)
  const query = args.query?.trim()

  const where: Prisma.TownWhereInput = {
    archivedAt: null,
    visibility: 'PUBLIC',
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { slug: { contains: query, mode: 'insensitive' } },
            { region: { contains: query, mode: 'insensitive' } },
            { tagline: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const towns = await db.town.findMany({
    where,
    take: limit,
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      tagline: true,
      region: true,
      logoUrl: true,
      accentColor: true,
      joinPolicy: true,
      _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
      memberships: {
        where: { accountId: args.accountId },
        select: { status: true },
        take: 1,
      },
      joinRequests: {
        where: { accountId: args.accountId, status: 'PENDING' },
        select: { id: true },
        take: 1,
      },
    },
  })

  return towns.map((town) => ({
    id: town.id,
    slug: town.slug,
    name: town.name,
    tagline: town.tagline,
    region: town.region,
    logoUrl: town.logoUrl,
    accentColor: town.accentColor,
    joinPolicy: town.joinPolicy,
    memberCount: town._count.memberships,
    relationship:
      town.memberships[0]?.status === 'ACTIVE'
        ? 'member'
        : town.joinRequests.length > 0
          ? 'pending'
          : 'none',
  }))
}

/** Towns this account is already a member of, for the picker's main grid. */
export async function listMyTowns(accountId: string) {
  const memberships = await db.townMembership.findMany({
    where: { accountId, status: 'ACTIVE', town: { archivedAt: null } },
    orderBy: { joinedAt: 'asc' },
    include: {
      town: {
        select: {
          id: true,
          slug: true,
          name: true,
          tagline: true,
          region: true,
          logoUrl: true,
          accentColor: true,
          ownerId: true,
          _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
        },
      },
      roles: { include: { role: { select: { name: true, color: true, priority: true } } } },
    },
  })

  return memberships.map((membership) => ({
    membershipId: membership.id,
    town: membership.town,
    isOwner: membership.town.ownerId === accountId,
    roles: membership.roles
      .map((entry) => entry.role)
      .sort((a, b) => a.priority - b.priority),
    title: membership.title,
    callsign: membership.callsign,
  }))
}

export type JoinOutcome =
  | { status: 'joined'; townSlug: string }
  | { status: 'requested' }
  | { status: 'already_member'; townSlug: string }
  | { status: 'already_pending' }
  | { status: 'invite_only' }
  | { status: 'not_found' }

/** Join an OPEN town outright, or file a request against a REQUEST town. */
export async function joinOrRequest(args: {
  accountId: string
  townId: string
  message?: string | null
}): Promise<JoinOutcome> {
  const town = await db.town.findFirst({
    where: { id: args.townId, archivedAt: null },
    select: { id: true, slug: true, joinPolicy: true },
  })

  if (!town) return { status: 'not_found' }

  const existing = await db.townMembership.findUnique({
    where: { townId_accountId: { townId: town.id, accountId: args.accountId } },
    select: { status: true },
  })

  if (existing?.status === 'ACTIVE') return { status: 'already_member', townSlug: town.slug }
  if (existing?.status === 'SUSPENDED') return { status: 'invite_only' }

  if (town.joinPolicy === 'INVITE') return { status: 'invite_only' }

  if (town.joinPolicy === 'OPEN') {
    await admitMember({ accountId: args.accountId, townId: town.id })
    return { status: 'joined', townSlug: town.slug }
  }

  const pending = await db.joinRequest.findFirst({
    where: { townId: town.id, accountId: args.accountId, status: 'PENDING' },
    select: { id: true },
  })

  if (pending) return { status: 'already_pending' }

  await db.joinRequest.create({
    data: {
      townId: town.id,
      accountId: args.accountId,
      message: args.message?.trim()?.slice(0, 1000) || null,
    },
  })

  return { status: 'requested' }
}

/**
 * Seat an account in a town with the default role. Used by open joins, request
 * approvals, and invite redemptions alike so all three paths agree.
 */
export async function admitMember(args: {
  accountId: string
  townId: string
  roleId?: string
}) {
  const roleId =
    args.roleId ??
    (
      await db.role.findFirst({
        where: { townId: args.townId, isDefault: true },
        select: { id: true },
      })
    )?.id

  return db.$transaction(async (tx) => {
    const membership = await tx.townMembership.upsert({
      where: { townId_accountId: { townId: args.townId, accountId: args.accountId } },
      create: { townId: args.townId, accountId: args.accountId },
      update: { status: 'ACTIVE' },
    })

    if (roleId) {
      await tx.memberRole.upsert({
        where: { membershipId_roleId: { membershipId: membership.id, roleId } },
        create: { membershipId: membership.id, roleId },
        update: {},
      })
    }

    await tx.auditLog.create({
      data: {
        townId: args.townId,
        actorId: args.accountId,
        action: 'member.admit',
        targetType: 'TownMembership',
        targetId: membership.id,
        meta: {},
      },
    })

    return membership
  })
}
