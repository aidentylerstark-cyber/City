import { notFound, redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth/session'
import { can, getTownContext } from '@/lib/towns/service'
import { GlobalSearch } from './global-search'

export const metadata = { title: 'Global search' }

export default async function SearchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const context = await getTownContext(user.account.id, slug)
  if (!context) notFound()

  if (!can(context, 'search.global')) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Global search</h1>
        <p className="mt-3 text-sm text-muted">
          Your role in {context.town.name} does not include cross-town search.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Global search</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Searches every town that shares its records, plus everything {context.town.name} holds
        privately.
      </p>
      <GlobalSearch townSlug={slug} />
    </main>
  )
}
