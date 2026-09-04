import { z } from 'zod'

import { jsonError, jsonOk, parseBody } from '@/lib/http'
import { getCurrentUser } from '@/lib/auth/session'
import { checkTownCreation, createTown } from '@/lib/towns/service'

const schema = z.object({
  name: z.string().min(2).max(60),
  tagline: z.string().max(140).optional(),
  description: z.string().max(4000).optional(),
  region: z.string().max(120).optional(),
  timezone: z.string().max(64).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #3b82f6.')
    .optional(),
  joinPolicy: z.enum(['OPEN', 'REQUEST', 'INVITE']).optional(),
  visibility: z.enum(['PUBLIC', 'UNLISTED']).optional(),
})

/** Who may create a town, and how many — checked here, not in the UI. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthorized', 'Sign in first.')

  const check = await checkTownCreation(user.account.id)
  return jsonOk(check)
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthorized', 'Sign in first.')

  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const check = await checkTownCreation(user.account.id)

  if (!check.allowed) {
    return check.reason === 'no_license'
      ? jsonError(
          403,
          'no_license',
          'Creating a town needs a City Link product license. Rez your City Link deed object in-world and touch it to register.',
        )
      : jsonError(
          403,
          'allowance_reached',
          `Your license covers ${check.allowance} town(s) and you already run ${check.used}. Archive one, or upgrade your license.`,
        )
  }

  const town = await createTown({ ownerId: user.account.id, ...body.data })

  return jsonOk({ ok: true, town: { id: town.id, slug: town.slug, name: town.name } }, 201)
}
