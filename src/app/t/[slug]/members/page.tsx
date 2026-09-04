import { notFound, redirect } from 'next/navigation'

import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'
import { can, getTownContext } from '@/lib/towns/service'
import { JoinRequestQueue } from './join-request-queue'

export const metadata = { title: 'Members' }

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const context = await getTownContext(user.account.id, slug)
  if (!context) notFound()

  if (!can(context, 'members.view')) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="mt-3 text-sm text-muted">
          Your role in {context.town.name} does not include the member roster.
        </p>
      </main>
    )
  }

  const mayReview = can(context, 'members.invite')

  const [members, requests] = await Promise.all([
    db.townMembership.findMany({
      where: { townId: context.town.id, status: 'ACTIVE' },
      orderBy: { joinedAt: 'asc' },
      include: {
        account: { include: { slAvatar: { select: { slUsername: true, slDisplayName: true } } } },
        roles: { include: { role: { select: { name: true, color: true, priority: true } } } },
      },
    }),
    mayReview
      ? db.joinRequest.findMany({
          where: { townId: context.town.id, status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          include: {
            account: {
              include: { slAvatar: { select: { slUsername: true, slDisplayName: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ])

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Members</h1>
      <p className="mt-1 text-sm text-muted">
        {members.length} active in {context.town.name}
      </p>

      {mayReview ? (
        <JoinRequestQueue
          townSlug={slug}
          requests={requests.map((request) => ({
            id: request.id,
            message: request.message,
            createdAt: request.createdAt.toISOString(),
            name: request.account.displayName ?? request.account.username,
            slUsername: request.account.slAvatar.slUsername,
          }))}
        />
      ) : null}

      <ul className="mt-8 divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {member.characterName ?? member.account.displayName ?? member.account.username}
              </p>
              <p className="truncate text-sm text-muted">
                {member.account.slAvatar.slUsername}
                {member.title ? ` · ${member.title}` : ''}
                {member.callsign ? ` · ${member.callsign}` : ''}
              </p>
            </div>

            <div className="ml-auto flex flex-wrap gap-1.5">
              {member.roles
                .map((entry) => entry.role)
                .sort((a, b) => a.priority - b.priority)
                .map((role) => (
                  <span
                    key={role.name}
                    className="rounded-md px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${role.color}22`, color: role.color }}
                  >
                    {role.name}
                  </span>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
