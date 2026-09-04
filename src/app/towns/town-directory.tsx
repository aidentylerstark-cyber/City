'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, Button, Card, Field, Input, Textarea } from '@/components/ui'
import type { TownSearchResult } from '@/lib/towns/service'

type CreationCheck =
  | { allowed: true; license: { id: string; townAllowance: number }; used: number }
  | { allowed: false; reason: 'no_license' | 'allowance_reached'; used?: number; allowance?: number }

/**
 * The lower half of the picker: find a town to join, or — if the account holds
 * a verified product license — found one.
 */
export function TownDirectory({ creation }: { creation: CreationCheck }) {
  const [tab, setTab] = useState<'find' | 'create'>('find')

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-center gap-2 border-b border-line">
        <TabButton active={tab === 'find'} onClick={() => setTab('find')}>
          Find a town
        </TabButton>
        <TabButton active={tab === 'create'} onClick={() => setTab('create')}>
          Create a town
          {creation.allowed ? null : (
            <span className="ml-1.5 rounded bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              Locked
            </span>
          )}
        </TabButton>
      </div>

      <div className="mt-6">
        {tab === 'find' ? <FindTowns /> : <CreateTown creation={creation} />}
      </div>
    </section>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`-mb-px flex items-center border-b-2 px-1 py-3 text-sm font-medium transition ${
        active ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function FindTowns() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [towns, setTowns] = useState<TownSearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    // Debounced so typing a town name is one request, not eight.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/towns/search?q=${encodeURIComponent(query)}`)
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled) setTowns(data.towns)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  async function join(town: TownSearchResult) {
    setFeedback(null)

    const response = await fetch('/api/towns/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ townId: town.id }),
    })
    const data = await response.json()

    if (!response.ok) {
      setFeedback({ tone: 'error', text: data.message ?? 'Could not join that town.' })
      return
    }

    setFeedback({ tone: 'info', text: data.message })

    if (data.status === 'joined') {
      router.push(`/t/${data.townSlug}`)
      return
    }

    router.refresh()
    setTowns((current) =>
      current.map((entry) =>
        entry.id === town.id
          ? { ...entry, relationship: data.status === 'requested' ? 'pending' : entry.relationship }
          : entry,
      ),
    )
  }

  return (
    <div className="space-y-5">
      <Field label="Search the town directory" hint="By name, region, or tagline.">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ashford, Rockport, Bayview…"
          type="search"
        />
      </Field>

      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

      {loading && towns.length === 0 ? (
        <p className="text-sm text-muted">Searching…</p>
      ) : towns.length === 0 ? (
        <p className="text-sm text-muted">
          No public towns matched. Towns set to invite-only do not appear here — ask their staff for
          a link.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {towns.map((town) => (
            <li key={town.id}>
              <Card className="flex h-full flex-col justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 h-9 w-9 shrink-0 rounded-xl"
                    style={{ backgroundColor: town.accentColor }}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{town.name}</p>
                    <p className="truncate text-sm text-muted">
                      {town.tagline ?? town.region ?? 'No description'}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {town.memberCount} member{town.memberCount === 1 ? '' : 's'} ·{' '}
                      {town.joinPolicy === 'OPEN'
                        ? 'Open to all'
                        : town.joinPolicy === 'REQUEST'
                          ? 'Approval required'
                          : 'Invite only'}
                    </p>
                  </div>
                </div>

                {town.relationship === 'member' ? (
                  <Button variant="secondary" onClick={() => router.push(`/t/${town.slug}`)}>
                    Open
                  </Button>
                ) : town.relationship === 'pending' ? (
                  <Button variant="secondary" disabled>
                    Request pending
                  </Button>
                ) : town.joinPolicy === 'INVITE' ? (
                  <Button variant="secondary" disabled>
                    Invite only
                  </Button>
                ) : (
                  <Button onClick={() => join(town)}>
                    {town.joinPolicy === 'OPEN' ? 'Join' : 'Request to join'}
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CreateTown({ creation }: { creation: CreationCheck }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [region, setRegion] = useState('')
  const [description, setDescription] = useState('')
  const [joinPolicy, setJoinPolicy] = useState<'OPEN' | 'REQUEST' | 'INVITE'>('REQUEST')

  if (!creation.allowed) {
    return (
      <Card className="space-y-3">
        <h3 className="font-semibold">
          {creation.reason === 'no_license'
            ? 'Creating a town needs a City Link license'
            : 'Your license is fully used'}
        </h3>

        {creation.reason === 'no_license' ? (
          <>
            <p className="text-sm text-muted">
              Towns are created by product owners. If you bought City Link, rez your{' '}
              <strong>City Link License</strong> object in-world and touch it — it registers your
              license against this account and unlocks this tab.
            </p>
            <p className="text-sm text-muted">
              You do not need a license to <em>join</em> a town. Anyone with a verified avatar can be
              a member, an officer, or a citizen.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            Your license covers {creation.allowance} town{creation.allowance === 1 ? '' : 's'} and you
            already run {creation.used}. Archive a town to free the slot, or upgrade your license.
          </p>
        )}
      </Card>
    )
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const response = await fetch('/api/towns/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          tagline: tagline || undefined,
          region: region || undefined,
          description: description || undefined,
          joinPolicy,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.message ?? 'Could not create the town.')
        return
      }

      router.push(`/t/${data.town.slug}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-5">
      <Alert tone="success">
        License verified. You may run {creation.license.townAllowance} town
        {creation.license.townAllowance === 1 ? '' : 's'} — {creation.used} in use.
      </Alert>

      <Field label="Town name">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ashford"
          maxLength={60}
          required
        />
      </Field>

      <Field label="Tagline" hint="One line, shown in the directory.">
        <Input
          value={tagline}
          onChange={(event) => setTagline(event.target.value)}
          placeholder="A coastal town with a long memory."
          maxLength={140}
        />
      </Field>

      <Field label="Second Life region" hint="Where the roleplay happens.">
        <Input
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          placeholder="Ashford Bay"
          maxLength={120}
        />
      </Field>

      <Field label="Description">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          maxLength={4000}
        />
      </Field>

      <Field label="Who can join?" error={error}>
        <div className="space-y-2">
          {(
            [
              ['OPEN', 'Anyone can join instantly'],
              ['REQUEST', 'Anyone can ask; staff approve'],
              ['INVITE', 'Invite code only'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="joinPolicy"
                value={value}
                checked={joinPolicy === value}
                onChange={() => setJoinPolicy(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </Field>

      <Button type="submit" disabled={pending || name.trim().length < 2}>
        {pending ? 'Creating…' : 'Create town'}
      </Button>
    </form>
  )
}
