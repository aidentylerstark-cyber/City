import { jsonError, jsonOk } from '@/lib/http'
import { getCurrentUser } from '@/lib/auth/session'
import { can, getTownContext } from '@/lib/towns/service'
import {
  globalLookupByUsername,
  globalNameSearch,
  globalPlateSearch,
} from '@/lib/records/global-search'
import { isValidSlUsername } from '@/lib/sl/username'

/**
 * Cross-town lookup, scoped to the town doing the searching.
 *
 * The viewer's town id comes from their membership, never from the query
 * string — otherwise anyone could name a town they do not belong to and see its
 * private records.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ townId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthorized', 'Sign in first.')

  const { townId } = await params
  const context = await getTownContext(user.account.id, townId)
  if (!context) return jsonError(404, 'not_found', 'You are not a member of that town.')

  if (!can(context, 'search.global')) {
    return jsonError(403, 'forbidden', 'You do not have cross-town search in this town.')
  }

  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? '').trim()
  const kind = url.searchParams.get('kind') ?? 'auto'

  if (query.length < 2) {
    return jsonError(400, 'query_too_short', 'Enter at least two characters.')
  }

  const scope = { viewerTownId: context.town.id }

  if (kind === 'plate') {
    return jsonOk({ kind: 'plate', results: await globalPlateSearch(query, scope) })
  }

  if (kind === 'avatar' || (kind === 'auto' && isValidSlUsername(query) && query.includes('.'))) {
    const summary = await globalLookupByUsername(query, scope)
    if (summary) return jsonOk({ kind: 'avatar', summary })
  }

  return jsonOk({ kind: 'name', results: await globalNameSearch(query, scope) })
}
