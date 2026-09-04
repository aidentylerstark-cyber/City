import Link from 'next/link'
import type { Route } from 'next'
import { notFound, redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth/session'
import { getTownContext, can } from '@/lib/towns/service'

/**
 * Every page under /t/[slug] runs through here, so membership is checked once
 * and a non-member sees a 404 rather than a 403 — a town's roster is not
 * something outsiders get to probe.
 */
export default async function TownLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const context = await getTownContext(user.account.id, slug)
  if (!context) notFound()

  // Only routes that exist go in the nav; typedRoutes fails the build if one
  // does not, which is exactly the check we want as modules land.
  const nav: Array<{ href: Route; label: string; show: boolean }> = [
    { href: `/t/${slug}` as Route, label: 'Overview', show: true },
    {
      href: `/t/${slug}/search` as Route,
      label: 'Global search',
      show: can(context, 'search.global'),
    },
    {
      href: `/t/${slug}/members` as Route,
      label: 'Members',
      show: can(context, 'members.view'),
    },
  ].filter((item) => item.show)

  return (
    <div className="min-h-dvh">
      <header
        className="border-b border-line bg-surface"
        style={{ borderTopColor: context.town.accentColor, borderTopWidth: 3 }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <Link href={`/t/${slug}`} className="flex items-center gap-2.5 font-semibold">
            <span
              aria-hidden
              className="h-7 w-7 rounded-lg"
              style={{ backgroundColor: context.town.accentColor }}
            />
            {context.town.name}
          </Link>

          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-muted transition hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/towns"
            className="ml-auto text-sm text-muted underline underline-offset-4 transition hover:text-ink"
          >
            Switch town
          </Link>
        </div>
      </header>

      {children}
    </div>
  )
}
