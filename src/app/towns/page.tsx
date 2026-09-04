import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth/session'
import { checkTownCreation, listMyTowns } from '@/lib/towns/service'
import { db } from '@/lib/db'
import { prettySlUsername } from '@/lib/sl/username'
import { TownDirectory } from './town-directory'
import { LogoutButton } from './logout-button'

export const metadata: Metadata = { title: 'Your towns' }

export default async function TownsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [towns, creation, pendingRequests] = await Promise.all([
    listMyTowns(user.account.id),
    checkTownCreation(user.account.id),
    db.joinRequest.findMany({
      where: { accountId: user.account.id, status: 'PENDING' },
      select: { id: true, createdAt: true, town: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted">City Link</p>
          <h1 className="mt-2 text-3xl font-semibold">
            Welcome back, {user.account.displayName ?? user.account.username}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as {prettySlUsername(user.account.slUsername)} · verified avatar
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Your towns</h2>

        {towns.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center">
            <p className="font-medium">You are not in a town yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Search the directory below to request a place in an existing community
              {creation.allowed ? ', or create your own.' : '.'}
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {towns.map((entry) => (
              <li key={entry.town.id}>
                <Link
                  href={`/t/${entry.town.slug}`}
                  className="group block h-full rounded-2xl border border-line bg-surface p-5 transition hover:border-brand"
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 h-9 w-9 shrink-0 rounded-xl"
                      style={{ backgroundColor: entry.town.accentColor }}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold group-hover:text-brand">
                        {entry.town.name}
                      </p>
                      <p className="truncate text-sm text-muted">
                        {entry.town.tagline ?? entry.town.region ?? 'No description'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {/* Owning the town and holding the Owner role are almost
                        always the same fact — only badge it separately when a
                        role does not already say so. */}
                    {entry.isOwner && !entry.roles.some((role) => role.name === 'Owner') ? (
                      <span className="rounded-md bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
                        Owner
                      </span>
                    ) : null}
                    {entry.roles.slice(0, 2).map((role) => (
                      <span
                        key={role.name}
                        className="rounded-md px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: `${role.color}22`, color: role.color }}
                      >
                        {role.name}
                      </span>
                    ))}
                  </div>

                  <p className="mt-3 text-xs text-muted">
                    {entry.town._count.memberships} member
                    {entry.town._count.memberships === 1 ? '' : 's'}
                    {entry.callsign ? ` · ${entry.callsign}` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingRequests.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Awaiting approval</h2>
          <ul className="mt-3 space-y-2">
            {pendingRequests.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-sm"
              >
                <span className="font-medium">{request.town.name}</span>
                <span className="text-muted">
                  Requested {request.createdAt.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TownDirectory creation={creation} />
    </main>
  )
}
