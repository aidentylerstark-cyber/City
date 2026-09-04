import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth/session'

export default async function HomePage() {
  const user = await getCurrentUser()
  if (user) redirect('/towns')

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted">City Link</p>
      <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight sm:text-5xl">
        One record. Every town.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        The management system for Second Life communities. Real-time dispatch, citizen and business
        records, issued IDs and license plates, and a record that follows your avatar across every
        town on the grid.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-xl bg-brand px-5 py-3 font-medium text-brand-ink transition hover:opacity-90"
        >
          Verify your avatar
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-line px-5 py-3 font-medium transition hover:bg-raised"
        >
          Sign in
        </Link>
      </div>

      <dl className="mt-16 grid gap-8 sm:grid-cols-3">
        {[
          {
            term: 'Verified by the grid',
            detail:
              'Your account is tied to your Second Life avatar. An in-world terminal IMs you a code — nobody can claim your name.',
          },
          {
            term: 'Towns stay sovereign',
            detail:
              'Every town runs its own roles and permissions, and can delete anything it owns. No shared admin, no shared roster.',
          },
          {
            term: 'Records travel',
            detail:
              'A license issued in one town resolves in every other. Get pulled over anywhere and the record is already there.',
          },
        ].map((item) => (
          <div key={item.term}>
            <dt className="font-medium">{item.term}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
