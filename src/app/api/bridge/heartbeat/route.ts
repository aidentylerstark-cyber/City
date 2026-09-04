import { z } from 'zod'

import { db } from '@/lib/db'
import { jsonOk } from '@/lib/http'
import { withBridge } from '@/lib/sl/guard'
import { isSlUuid } from '@/lib/sl/bridge'

const schema = z.object({
  objectUuid: z.string().refine(isSlUuid, 'Not a Second Life key.'),
  region: z.string().max(120).optional(),
})

/**
 * Keep-alive from a deeded product object. A licence that stops reporting goes
 * DORMANT rather than being revoked — sims go down, and a town should not
 * disappear because its owner's sim rebooted.
 */
export async function POST(request: Request) {
  return withBridge(request, schema, async ({ body }) => {
    const license = await db.productLicense.findUnique({
      where: { objectUuid: body.objectUuid },
      select: { id: true, status: true },
    })

    if (!license) return jsonOk({ ok: false, reason: 'unknown_object' })
    if (license.status === 'REVOKED') return jsonOk({ ok: false, reason: 'revoked' })

    await db.productLicense.update({
      where: { id: license.id },
      data: { lastHeartbeat: new Date(), status: 'ACTIVE', region: body.region ?? null },
    })

    return jsonOk({ ok: true })
  })
}
