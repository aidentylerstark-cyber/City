import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'

import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/session'
import { getTownContext, can } from '@/lib/towns/service'
import { Card } from '@/components/ui'

export default async function TownOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const context = await getTownContext(user.account.id, slug)
  if (!context) notFound()

  const [citizens, activeWarrants, openCalls, pendingRequests, members] = await Promise.all([
    db.citizen.count({ where: { townId: context.town.id } }),
    db.warrant.count({ where: { townId: context.town.id, status: 'ACTIVE' } }),
    db.dispatchCall.count({
      where: { townId: context.town.id, status: { in: ['PENDING', 'DISPATCHED', 'ACTIVE'] } },
    }),
    can(context, 'members.invite')
      ? db.joinRequest.count({ where: { townId: context.town.id, status: 'PENDING' } })
      : Promise.resolve(0),
    db.townMembership.count({ where: { townId: context.town.id, status: 'ACTIVE' } }),
  ])

  const stats = [
    { label: 'Citizens on file', value: citizens },
    { label: 'Active warrants', value: activeWarrants },
    { label: 'Open calls', value: openCalls },
    { label: 'Members', value: members },
  ]

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">{context.town.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {context.membership.title ?? 'Member'}
        {context.membership.callsign ? ` · ${context.membership.callsign}` : ''}
      </p>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <dt className="text-sm text-muted">{stat.label}</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{stat.value}</dd>
          </Card>
        ))}
      </dl>

      {pendingRequests > 0 ? (
        <Link href={`/t/${slug}/members` as Route} className="mt-6 block">
          <Card className="border-brand/40 bg-brand/5 transition hover:bg-brand/10">
            <p className="font-medium">
              {pendingRequests} join request{pendingRequests === 1 ? '' : 's'} waiting for review
            </p>
            <p className="mt-1 text-sm text-muted">Review them on the members page.</p>
          </Card>
        </Link>
      ) : null}

      {can(context, 'search.global') ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Cross-town search</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Run an avatar or a plate against every town that shares its records. A license issued in
            another community, an unpaid citation, an active warrant — it all resolves here.
          </p>
          <Link
            href={`/t/${slug}/search` as Route}
            className="mt-4 inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink transition hover:opacity-90"
          >
            Open global search
          </Link>
        </section>
      ) : null}

      <section className="mt-12 rounded-2xl border border-dashed border-line p-6">
        <h2 className="font-semibold">Coming next in this town</h2>
        <p className="mt-2 text-sm text-muted">
          Dispatch board, citizen files, document issuing, the report builder, and personnel
          scheduling are modelled in the database and scoped by this town&apos;s permissions — their
          interfaces are next. See <code className="font-mono text-xs">docs/roadmap.md</code>.
        </p>
      </section>
    </main>
  )
}
