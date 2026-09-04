import { z } from 'zod'

import { jsonError, jsonOk, parseBody } from '@/lib/http'
import { getCurrentUser, setActiveTown } from '@/lib/auth/session'
import { getTownContext } from '@/lib/towns/service'

const schema = z.object({ townId: z.string().min(1).nullable() })

/** Set which town the session is "inside". Null returns to the picker. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthorized', 'Sign in first.')

  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  if (body.data.townId === null) {
    await setActiveTown(user.sessionId, null)
    return jsonOk({ ok: true, activeTownId: null })
  }

  const context = await getTownContext(user.account.id, body.data.townId)
  if (!context) return jsonError(404, 'not_found', 'You are not a member of that town.')

  await setActiveTown(user.sessionId, context.town.id)
  return jsonOk({ ok: true, activeTownId: context.town.id, slug: context.town.slug })
}
