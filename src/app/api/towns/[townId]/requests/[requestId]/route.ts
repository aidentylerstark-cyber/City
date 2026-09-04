import { z } from 'zod'

import { db } from '@/lib/db'
import { jsonError, jsonOk, parseBody } from '@/lib/http'
import { getCurrentUser } from '@/lib/auth/session'
import { admitMember, can, getTownContext } from '@/lib/towns/service'

const schema = z.object({
  decision: z.enum(['APPROVE', 'DENY']),
  note: z.string().max(1000).optional(),
})

/** Approve or deny a pending join request. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ townId: string; requestId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return jsonError(401, 'unauthorized', 'Sign in first.')

  const { townId, requestId } = await params
  const context = await getTownContext(user.account.id, townId)
  if (!context) return jsonError(404, 'not_found', 'You are not a member of that town.')

  if (!can(context, 'members.invite')) {
    return jsonError(403, 'forbidden', 'You cannot review join requests in this town.')
  }

  const body = await parseBody(request, schema)
  if (!body.ok) return body.response

  const joinRequest = await db.joinRequest.findFirst({
    // Scoped to this town, so a request id from elsewhere cannot be actioned.
    where: { id: requestId, townId: context.town.id, status: 'PENDING' },
    select: { id: true, accountId: true },
  })

  if (!joinRequest) return jsonError(404, 'not_found', 'That request is no longer pending.')

  const approved = body.data.decision === 'APPROVE'

  await db.joinRequest.update({
    where: { id: joinRequest.id },
    data: {
      status: approved ? 'APPROVED' : 'DENIED',
      reviewedById: user.account.id,
      reviewedAt: new Date(),
      reviewNote: body.data.note ?? null,
    },
  })

  if (approved) {
    await admitMember({ accountId: joinRequest.accountId, townId: context.town.id })
  }

  await db.auditLog.create({
    data: {
      townId: context.town.id,
      actorId: user.account.id,
      action: approved ? 'join_request.approve' : 'join_request.deny',
      targetType: 'JoinRequest',
      targetId: joinRequest.id,
      meta: {},
    },
  })

  return jsonOk({ ok: true, status: approved ? 'APPROVED' : 'DENIED' })
}
