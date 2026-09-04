/**
 * Development seed.
 *
 * Builds the scenario City Link exists for: the same avatar, on file in two
 * towns, with a licence issued by one and a warrant out of the other. Run a
 * global search in Rockport for `dana.reyes` and Ashford's records come back.
 *
 *   npm run db:seed
 *
 * Every seeded account signs in with the password below.
 */

import { PrismaClient } from '@prisma/client'

import { hashPassword } from '../src/lib/crypto'
import { SYSTEM_ROLES } from '../src/lib/permissions'

const db = new PrismaClient()

const SEED_PASSWORD = 'citylink-dev-password'

async function makeAccount(args: {
  slUsername: string
  slUuid: string
  displayName: string
  email: string
  username: string
}) {
  const avatar = await db.sLAvatar.upsert({
    where: { slUsername: args.slUsername },
    create: {
      slUsername: args.slUsername,
      slUuid: args.slUuid,
      slDisplayName: args.displayName,
      lastVerified: new Date(),
    },
    update: { slUuid: args.slUuid, slDisplayName: args.displayName },
  })

  const account = await db.account.upsert({
    where: { slAvatarId: avatar.id },
    create: {
      slAvatarId: avatar.id,
      email: args.email,
      username: args.username,
      displayName: args.displayName,
      passwordHash: await hashPassword(SEED_PASSWORD),
    },
    update: {},
  })

  return { avatar, account }
}

async function makeTown(args: {
  ownerId: string
  slug: string
  name: string
  tagline: string
  region: string
  accentColor: string
  shareRecords?: boolean
}) {
  const town = await db.town.upsert({
    where: { slug: args.slug },
    create: {
      slug: args.slug,
      name: args.name,
      tagline: args.tagline,
      region: args.region,
      accentColor: args.accentColor,
      shareRecords: args.shareRecords ?? true,
      ownerId: args.ownerId,
      joinPolicy: 'REQUEST',
    },
    update: {},
  })

  for (const role of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { townId_name: { townId: town.id, name: role.name } },
      create: {
        townId: town.id,
        name: role.name,
        color: role.color,
        priority: role.priority,
        permissions: [...role.permissions],
        isSystem: role.isSystem,
        isDefault: role.isDefault,
      },
      update: {},
    })
  }

  const ownerRole = await db.role.findFirstOrThrow({
    where: { townId: town.id, name: 'Owner' },
  })

  const membership = await db.townMembership.upsert({
    where: { townId_accountId: { townId: town.id, accountId: args.ownerId } },
    create: { townId: town.id, accountId: args.ownerId, title: 'Owner' },
    update: {},
  })

  await db.memberRole.upsert({
    where: { membershipId_roleId: { membershipId: membership.id, roleId: ownerRole.id } },
    create: { membershipId: membership.id, roleId: ownerRole.id },
    update: {},
  })

  return town
}

async function main() {
  console.log('Seeding City Link…')

  // --- Accounts ------------------------------------------------------------
  const mayor = await makeAccount({
    slUsername: 'ash.mayfield',
    slUuid: '11111111-1111-4111-8111-111111111111',
    displayName: 'Ash Mayfield',
    email: 'ash@example.com',
    username: 'ashmayfield',
  })

  const chief = await makeAccount({
    slUsername: 'rory.vance',
    slUuid: '22222222-2222-4222-8222-222222222222',
    displayName: 'Rory Vance',
    email: 'rory@example.com',
    username: 'roryvance',
  })

  // The person the cross-town scenario is about.
  const subject = await makeAccount({
    slUsername: 'dana.reyes',
    slUuid: '33333333-3333-4333-8333-333333333333',
    displayName: 'Dana Reyes',
    email: 'dana@example.com',
    username: 'danareyes',
  })

  // --- Licences ------------------------------------------------------------
  await db.productLicense.upsert({
    where: { objectUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    create: {
      accountId: mayor.account.id,
      objectUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      objectName: 'City Link License (seed)',
      productKey: 'citylink-standard',
      townAllowance: 2,
    },
    update: {},
  })

  await db.productLicense.upsert({
    where: { objectUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    create: {
      accountId: chief.account.id,
      objectUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      objectName: 'City Link License (seed)',
      productKey: 'citylink-standard',
      townAllowance: 1,
    },
    update: {},
  })

  // --- Towns ---------------------------------------------------------------
  const ashford = await makeTown({
    ownerId: mayor.account.id,
    slug: 'ashford',
    name: 'Ashford',
    tagline: 'A coastal town with a long memory.',
    region: 'Ashford Bay',
    accentColor: '#2563eb',
  })

  const rockport = await makeTown({
    ownerId: chief.account.id,
    slug: 'rockport',
    name: 'Rockport',
    tagline: 'Mountain county seat.',
    region: 'Rockport Ridge',
    accentColor: '#059669',
  })

  // Dana is a member of Ashford, and files a request to join Rockport so the
  // approval queue has something in it.
  const danaInAshford = await db.townMembership.upsert({
    where: { townId_accountId: { townId: ashford.id, accountId: subject.account.id } },
    create: { townId: ashford.id, accountId: subject.account.id, characterName: 'Dana Reyes' },
    update: {},
  })

  const ashfordMember = await db.role.findFirstOrThrow({
    where: { townId: ashford.id, name: 'Member' },
  })
  await db.memberRole.upsert({
    where: { membershipId_roleId: { membershipId: danaInAshford.id, roleId: ashfordMember.id } },
    create: { membershipId: danaInAshford.id, roleId: ashfordMember.id },
    update: {},
  })

  const alreadyRequested = await db.joinRequest.findFirst({
    where: { townId: rockport.id, accountId: subject.account.id },
  })
  if (!alreadyRequested) {
    await db.joinRequest.create({
      data: {
        townId: rockport.id,
        accountId: subject.account.id,
        message: 'Moving up the coast — would like to transfer my records.',
      },
    })
  }

  // --- Records -------------------------------------------------------------
  const danaAshford = await db.citizen.upsert({
    where: { townId_slAvatarId: { townId: ashford.id, slAvatarId: subject.avatar.id } },
    create: {
      townId: ashford.id,
      slAvatarId: subject.avatar.id,
      firstName: 'Dana',
      lastName: 'Reyes',
      dateOfBirth: new Date('1994-04-19'),
      address: '14 Harbour Row, Ashford',
      occupation: 'Dock foreman',
      eyes: 'Brown',
      hair: 'Black',
      flags: [],
    },
    update: {},
  })

  // Ashford issued the licence. This is what a Rockport deputy will find.
  await db.issuedDocument.upsert({
    where: {
      townId_type_number: {
        townId: ashford.id,
        type: 'DRIVERS_LICENSE',
        number: 'ASH-DL-004182',
      },
    },
    create: {
      townId: ashford.id,
      type: 'DRIVERS_LICENSE',
      number: 'ASH-DL-004182',
      citizenId: danaAshford.id,
      slAvatarId: subject.avatar.id,
      holderName: 'Dana Reyes',
      status: 'VALID',
      issuedAt: new Date('2025-11-02'),
      expiresAt: new Date('2029-11-02'),
      data: { class: 'C', endorsements: [], restrictions: ['Corrective lenses'] },
    },
    update: {},
  })

  await db.issuedDocument.upsert({
    where: {
      townId_type_number: { townId: ashford.id, type: 'ID_CARD', number: 'ASH-ID-004182' },
    },
    create: {
      townId: ashford.id,
      type: 'ID_CARD',
      number: 'ASH-ID-004182',
      citizenId: danaAshford.id,
      slAvatarId: subject.avatar.id,
      holderName: 'Dana Reyes',
      issuedAt: new Date('2025-11-02'),
      data: {},
    },
    update: {},
  })

  await db.vehicle.upsert({
    where: { townId_plate: { townId: ashford.id, plate: '4TZ991' } },
    create: {
      townId: ashford.id,
      plate: '4TZ991',
      citizenId: danaAshford.id,
      slAvatarId: subject.avatar.id,
      make: 'Corvair',
      model: 'Ranchero',
      year: 2019,
      color: 'Slate',
      insured: true,
    },
    update: {},
  })

  // Rockport has its own file on her, and an open warrant. A search from
  // Ashford surfaces this; a search from Rockport surfaces Ashford's licence.
  const danaRockport = await db.citizen.upsert({
    where: { townId_slAvatarId: { townId: rockport.id, slAvatarId: subject.avatar.id } },
    create: {
      townId: rockport.id,
      slAvatarId: subject.avatar.id,
      firstName: 'Dana',
      lastName: 'Reyes',
      flags: ['FAILED_TO_APPEAR'],
      notes: 'Cited 2026-01-12, did not appear.',
    },
    update: {},
  })

  await db.citation.upsert({
    where: { townId_number: { townId: rockport.id, number: 'RKP-C-2026-0117' } },
    create: {
      townId: rockport.id,
      number: 'RKP-C-2026-0117',
      citizenId: danaRockport.id,
      slAvatarId: subject.avatar.id,
      charges: [{ code: 'TR-14', title: 'Speed over posted limit', fine: 250, points: 2 }],
      fineTotal: 250,
      status: 'UNPAID',
      location: 'Ridge Road at Mile 4',
      issuedAt: new Date('2026-01-12'),
    },
    update: {},
  })

  await db.warrant.upsert({
    where: { townId_number: { townId: rockport.id, number: 'RKP-W-2026-0031' } },
    create: {
      townId: rockport.id,
      number: 'RKP-W-2026-0031',
      citizenId: danaRockport.id,
      slAvatarId: subject.avatar.id,
      type: 'BENCH',
      status: 'ACTIVE',
      charges: [{ code: 'CT-01', title: 'Failure to appear' }],
      bond: 500,
      issuedAt: new Date('2026-02-03'),
    },
    update: {},
  })

  console.log(`
Seeded.

  Sign in with password: ${SEED_PASSWORD}

    ash@example.com    Ash Mayfield  — owns Ashford, licensed for 2 towns
    rory@example.com   Rory Vance    — owns Rockport, 1 pending join request
    dana@example.com   Dana Reyes    — member of Ashford, no license

  Try it: sign in as rory, open Rockport, go to Global search, and look up
  "dana.reyes". Ashford's driver's license comes back alongside Rockport's own
  active warrant.
`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
