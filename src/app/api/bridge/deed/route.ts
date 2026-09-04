import { z } from 'zod'

import { db } from '@/lib/db'
import { jsonOk } from '@/lib/http'
import { withBridge } from '@/lib/sl/guard'
import { isSlUuid } from '@/lib/sl/bridge'
import { normalizeSlUsername } from '@/lib/sl/username'

const schema = z.object({
  /** llGetOwner of the deed object. */
  ownerUuid: z.string().refine(isSlUuid, 'Not a Second Life key.'),
  ownerUsername: z.string().min(2).max(63),
  /** llGetKey — this object's own key, the licence identity. */
  objectUuid: z.string().refine(isSlUuid, 'Not a Second Life key.'),
  objectName: z.string().max(120).optional(),
  productKey: z.string().min(1).max(64),
  region: z.string().max(120).optional(),
  // llList2Json stringifies every value, so accept "1" as readily as 1.
  townAllowance: z.coerce.number().int().min(1).max(25).optional(),
})

/**
 * Product ownership.
 *
 * The City Link product object, once rezzed, reports its owner. If that owner
 * has a City Link account, they get a licence — which is what unlocks "create a
 * town" on the picker.
 *
 * Deliberately weaker than avatar verification, and that asymmetry is the
 * point: an object can be handed around, so object-reported ownership grants a
 * *capability* (create a town), never an *identity* (be someone). An account
 * still only ever comes from a code delivered to the avatar.
 *
 * Idempotent: the same object re-reporting refreshes the heartbeat rather than
 * minting a second licence, so a sim restart does not multiply allowances.
 */
export async function POST(request: Request) {
  return withBridge(request, schema, async ({ body }) => {
    const slUsername = normalizeSlUsername(body.ownerUsername)

    const avatar = await db.sLAvatar.findFirst({
      where: { OR: [{ slUsername }, { slUuid: body.ownerUuid }] },
      select: { id: true, account: { select: { id: true } } },
    })

    if (!avatar?.account) {
      return jsonOk({
        licensed: false,
        reason: 'no_account',
        message:
          'No City Link account is linked to this avatar yet. Create one at the website, then touch me again to register your license.',
      })
    }

    const accountId = avatar.account.id

    const existing = await db.productLicense.findUnique({
      where: { objectUuid: body.objectUuid },
      select: { id: true, accountId: true, status: true, townAllowance: true },
    })

    if (existing) {
      if (existing.status === 'REVOKED') {
        return jsonOk({
          licensed: false,
          reason: 'revoked',
          message: 'This license was revoked. Contact City Link support.',
        })
      }

      const license = await db.productLicense.update({
        where: { id: existing.id },
        data: {
          // The object was passed to someone else — the licence follows it.
          accountId,
          status: 'ACTIVE',
          lastHeartbeat: new Date(),
          region: body.region ?? null,
          objectName: body.objectName ?? null,
        },
        select: { id: true, townAllowance: true },
      })

      return jsonOk({
        licensed: true,
        licenseId: license.id,
        townAllowance: license.townAllowance,
        message: `City Link license confirmed. You may run ${license.townAllowance} town(s).`,
      })
    }

    const license = await db.productLicense.create({
      data: {
        accountId,
        objectUuid: body.objectUuid,
        objectName: body.objectName ?? null,
        productKey: body.productKey,
        region: body.region ?? null,
        townAllowance: body.townAllowance ?? 1,
        lastHeartbeat: new Date(),
      },
      select: { id: true, townAllowance: true },
    })

    await db.auditLog.create({
      data: {
        actorId: accountId,
        action: 'license.grant',
        targetType: 'ProductLicense',
        targetId: license.id,
        meta: { objectUuid: body.objectUuid, productKey: body.productKey },
      },
    })

    return jsonOk({
      licensed: true,
      licenseId: license.id,
      townAllowance: license.townAllowance,
      message: `City Link license registered. You may now create ${license.townAllowance} town(s) on the website.`,
    })
  })
}
