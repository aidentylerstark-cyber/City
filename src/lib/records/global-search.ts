import { db } from '@/lib/db'
import { normalizeSlUsername } from '@/lib/sl/username'

/**
 * Cross-town record lookup.
 *
 * The scenario this exists for: a deputy in Rockport stops someone who has
 * never set foot in Rockport's records. They run the avatar and get back the
 * licence Ashford issued last month, the two citations Bayview wrote, and the
 * active warrant out of Northgate.
 *
 * Two rules govern what comes back:
 *
 *   1. A town that sets `shareRecords = false` goes dark. Its records never
 *      appear in anyone else's results. It can still search others — opting out
 *      of publishing is a choice about your own data, not about theirs.
 *   2. The searching town always sees its *own* records, dark or not.
 *
 * Everything keys off SLAvatar, never Citizen. That is deliberate: when Ashford
 * deletes its citizen record for someone, the licence Ashford issued still
 * carries the avatar id, so the document keeps resolving. Towns own their
 * citizen files; the documents they put into the world outlive them.
 */

export type GlobalSearchScope = {
  /** Town doing the searching. Its own records bypass the sharing filter. */
  viewerTownId: string
}

export type GlobalRecordSummary = {
  avatar: {
    id: string
    slUsername: string
    slDisplayName: string | null
    slUuid: string | null
  }
  /** Best-known legal name, taken from the most recently touched citizen file. */
  knownAs: string | null
  /** Newest first. */
  documents: Array<{
    id: string
    type: string
    number: string
    holderName: string
    status: string
    issuedAt: Date
    expiresAt: Date | null
    town: { id: string; name: string; slug: string; accentColor: string }
    isOwnTown: boolean
  }>
  citations: Array<{
    id: string
    number: string
    fineTotal: number
    status: string
    issuedAt: Date
    charges: unknown
    town: { id: string; name: string; slug: string }
    isOwnTown: boolean
  }>
  warrants: Array<{
    id: string
    number: string
    type: string
    status: string
    bond: number | null
    issuedAt: Date
    charges: unknown
    town: { id: string; name: string; slug: string }
    isOwnTown: boolean
  }>
  vehicles: Array<{
    id: string
    plate: string
    make: string | null
    model: string | null
    color: string | null
    registrationStatus: string
    stolen: boolean
    town: { id: string; name: string; slug: string }
    isOwnTown: boolean
  }>
  /** Towns that hold a citizen file on this avatar and share their records. */
  knownInTowns: Array<{ id: string; name: string; slug: string }>
  /** Set when anything demands immediate attention: active warrant, stolen plate. */
  alerts: string[]
}

/** Records are visible if the owning town shares them, or is the viewer. */
function visibilityFilter(viewerTownId: string) {
  return {
    OR: [{ townId: viewerTownId }, { town: { shareRecords: true, archivedAt: null } }],
  }
}

const townSelect = { id: true, name: true, slug: true, accentColor: true } as const

/** Look an avatar up by SL username. */
export async function globalLookupByUsername(
  slUsername: string,
  scope: GlobalSearchScope,
): Promise<GlobalRecordSummary | null> {
  const avatar = await db.sLAvatar.findUnique({
    where: { slUsername: normalizeSlUsername(slUsername) },
    select: { id: true, slUsername: true, slDisplayName: true, slUuid: true },
  })

  if (!avatar) return null
  return buildSummary(avatar, scope)
}

export async function globalLookupByAvatarId(
  avatarId: string,
  scope: GlobalSearchScope,
): Promise<GlobalRecordSummary | null> {
  const avatar = await db.sLAvatar.findUnique({
    where: { id: avatarId },
    select: { id: true, slUsername: true, slDisplayName: true, slUuid: true },
  })

  if (!avatar) return null
  return buildSummary(avatar, scope)
}

/**
 * Run a plate across every sharing town. The one lookup a deputy does before
 * they have a name.
 */
export async function globalPlateSearch(plate: string, scope: GlobalSearchScope) {
  const normalized = plate.trim().toUpperCase().replace(/[\s-]/g, '')

  const vehicles = await db.vehicle.findMany({
    where: {
      AND: [visibilityFilter(scope.viewerTownId), { plate: { equals: normalized, mode: 'insensitive' } }],
    },
    take: 25,
    include: {
      town: { select: townSelect },
      citizen: { select: { firstName: true, lastName: true, slAvatarId: true } },
    },
  })

  return vehicles.map((vehicle) => ({
    id: vehicle.id,
    plate: vehicle.plate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    color: vehicle.color,
    registrationStatus: vehicle.registrationStatus,
    stolen: vehicle.stolen,
    insured: vehicle.insured,
    town: vehicle.town,
    isOwnTown: vehicle.townId === scope.viewerTownId,
    registeredTo: vehicle.citizen
      ? {
          name: `${vehicle.citizen.firstName} ${vehicle.citizen.lastName}`,
          slAvatarId: vehicle.citizen.slAvatarId,
        }
      : null,
    slAvatarId: vehicle.slAvatarId,
  }))
}

/**
 * Free-text search across avatars and the citizen files that name them. Used by
 * the search bar when the deputy has a name but not a username.
 */
export async function globalNameSearch(query: string, scope: GlobalSearchScope) {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const citizens = await db.citizen.findMany({
    where: {
      AND: [
        visibilityFilter(scope.viewerTownId),
        { slAvatarId: { not: null } },
        {
          OR: [
            { firstName: { contains: trimmed, mode: 'insensitive' } },
            { lastName: { contains: trimmed, mode: 'insensitive' } },
            { slAvatar: { slUsername: { contains: normalizeSlUsername(trimmed), mode: 'insensitive' } } },
            { slAvatar: { slDisplayName: { contains: trimmed, mode: 'insensitive' } } },
          ],
        },
      ],
    },
    take: 30,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      flags: true,
      townId: true,
      town: { select: townSelect },
      slAvatar: { select: { id: true, slUsername: true, slDisplayName: true } },
    },
  })

  // Collapse to one row per avatar — the same person filed in four towns is one
  // search hit, not four.
  const byAvatar = new Map<string, (typeof citizens)[number] & { alsoIn: string[] }>()
  for (const citizen of citizens) {
    const key = citizen.slAvatar!.id
    const existing = byAvatar.get(key)
    if (existing) {
      existing.alsoIn.push(citizen.town.name)
    } else {
      byAvatar.set(key, { ...citizen, alsoIn: [] })
    }
  }

  return [...byAvatar.values()].map((citizen) => ({
    avatarId: citizen.slAvatar!.id,
    slUsername: citizen.slAvatar!.slUsername,
    slDisplayName: citizen.slAvatar!.slDisplayName,
    name: `${citizen.firstName} ${citizen.lastName}`,
    photoUrl: citizen.photoUrl,
    flags: citizen.flags,
    primaryTown: citizen.town,
    isOwnTown: citizen.townId === scope.viewerTownId,
    alsoIn: citizen.alsoIn,
  }))
}

async function buildSummary(
  avatar: { id: string; slUsername: string; slDisplayName: string | null; slUuid: string | null },
  scope: GlobalSearchScope,
): Promise<GlobalRecordSummary> {
  const visible = visibilityFilter(scope.viewerTownId)
  const own = (townId: string) => townId === scope.viewerTownId

  const [documents, citations, warrants, vehicles, citizenFiles] = await Promise.all([
    db.issuedDocument.findMany({
      where: { AND: [visible, { slAvatarId: avatar.id }] },
      orderBy: { issuedAt: 'desc' },
      take: 50,
      include: { town: { select: townSelect } },
    }),
    db.citation.findMany({
      where: { AND: [visible, { slAvatarId: avatar.id }] },
      orderBy: { issuedAt: 'desc' },
      take: 50,
      include: { town: { select: townSelect } },
    }),
    db.warrant.findMany({
      where: { AND: [visible, { slAvatarId: avatar.id }] },
      // Active warrants first, then newest.
      orderBy: [{ status: 'asc' }, { issuedAt: 'desc' }],
      take: 50,
      include: { town: { select: townSelect } },
    }),
    db.vehicle.findMany({
      where: { AND: [visible, { slAvatarId: avatar.id }] },
      orderBy: { registeredAt: 'desc' },
      take: 50,
      include: { town: { select: townSelect } },
    }),
    db.citizen.findMany({
      where: { AND: [visible, { slAvatarId: avatar.id }] },
      orderBy: { updatedAt: 'desc' },
      select: {
        firstName: true,
        lastName: true,
        flags: true,
        town: { select: { id: true, name: true, slug: true } },
      },
    }),
  ])

  const alerts: string[] = []

  const activeWarrants = warrants.filter((warrant) => warrant.status === 'ACTIVE')
  if (activeWarrants.length > 0) {
    alerts.push(
      `${activeWarrants.length} active warrant${activeWarrants.length === 1 ? '' : 's'} — ` +
        [...new Set(activeWarrants.map((warrant) => warrant.town.name))].join(', '),
    )
  }

  if (vehicles.some((vehicle) => vehicle.stolen)) alerts.push('Registered vehicle reported stolen')

  const suspendedLicense = documents.find(
    (document) =>
      document.type === 'DRIVERS_LICENSE' &&
      (document.status === 'SUSPENDED' || document.status === 'REVOKED'),
  )
  if (suspendedLicense) {
    alerts.push(`Driver's license ${suspendedLicense.status.toLowerCase()} (${suspendedLicense.town.name})`)
  }

  for (const flag of new Set(citizenFiles.flatMap((citizen) => citizen.flags))) {
    alerts.push(`Flag: ${flag}`)
  }

  return {
    avatar,
    knownAs: citizenFiles[0] ? `${citizenFiles[0].firstName} ${citizenFiles[0].lastName}` : null,
    documents: documents.map((document) => ({
      id: document.id,
      type: document.type,
      number: document.number,
      holderName: document.holderName,
      status: document.status,
      issuedAt: document.issuedAt,
      expiresAt: document.expiresAt,
      town: document.town,
      isOwnTown: own(document.townId),
    })),
    citations: citations.map((citation) => ({
      id: citation.id,
      number: citation.number,
      fineTotal: citation.fineTotal,
      status: citation.status,
      issuedAt: citation.issuedAt,
      charges: citation.charges,
      town: citation.town,
      isOwnTown: own(citation.townId),
    })),
    warrants: warrants.map((warrant) => ({
      id: warrant.id,
      number: warrant.number,
      type: warrant.type,
      status: warrant.status,
      bond: warrant.bond,
      issuedAt: warrant.issuedAt,
      charges: warrant.charges,
      town: warrant.town,
      isOwnTown: own(warrant.townId),
    })),
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      plate: vehicle.plate,
      make: vehicle.make,
      model: vehicle.model,
      color: vehicle.color,
      registrationStatus: vehicle.registrationStatus,
      stolen: vehicle.stolen,
      town: vehicle.town,
      isOwnTown: own(vehicle.townId),
    })),
    knownInTowns: citizenFiles.map((citizen) => citizen.town),
    alerts,
  }
}

/** The one query the user's pitch names explicitly: most recent licence. */
export async function mostRecentLicense(avatarId: string, scope: GlobalSearchScope) {
  return db.issuedDocument.findFirst({
    where: {
      AND: [
        visibilityFilter(scope.viewerTownId),
        { slAvatarId: avatarId, type: 'DRIVERS_LICENSE' },
      ],
    },
    orderBy: { issuedAt: 'desc' },
    include: { town: { select: townSelect } },
  })
}
