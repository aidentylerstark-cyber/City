'use client'

import { useState } from 'react'

import { Alert, Button, Card, Field, Input } from '@/components/ui'

type Kind = 'auto' | 'avatar' | 'plate'

export function GlobalSearch({ townSlug }: { townSlug: string }) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('auto')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  async function run(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch(
        `/api/towns/${townSlug}/search?q=${encodeURIComponent(query)}&kind=${kind}`,
      )
      const data = await response.json()

      if (!response.ok) {
        setError(data.message ?? 'Search failed.')
        return
      }

      setResult(data)
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <form onSubmit={run} className="space-y-4">
        <Field label="Avatar username, name, or plate">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="john.doe · Jane Harper · 4TZ-991"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </Field>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-4 text-sm">
            {(
              [
                ['auto', 'Auto'],
                ['avatar', 'Avatar'],
                ['plate', 'Plate'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="kind"
                  checked={kind === value}
                  onChange={() => setKind(value)}
                />
                {label}
              </label>
            ))}
          </div>

          <Button type="submit" disabled={busy || query.trim().length < 2}>
            {busy ? 'Searching…' : 'Search'}
          </Button>
        </div>
      </form>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {result?.kind === 'avatar' ? <AvatarSummary summary={result.summary} /> : null}
      {result?.kind === 'plate' ? <PlateResults results={result.results} /> : null}
      {result?.kind === 'name' ? <NameResults results={result.results} /> : null}
    </div>
  )
}

function AvatarSummary({ summary }: { summary: any }) {
  return (
    <div className="space-y-5">
      {summary.alerts.length > 0 ? (
        <Alert tone="error">
          <p className="font-semibold">Attention</p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5">
            {summary.alerts.map((alert: string) => (
              <li key={alert}>{alert}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Card>
        <p className="text-lg font-semibold">{summary.knownAs ?? summary.avatar.slUsername}</p>
        <p className="text-sm text-muted">
          {summary.avatar.slUsername}
          {summary.avatar.slDisplayName ? ` · "${summary.avatar.slDisplayName}"` : ''}
        </p>
        {summary.knownInTowns.length > 0 ? (
          <p className="mt-3 text-sm text-muted">
            On file in {summary.knownInTowns.map((town: any) => town.name).join(', ')}
          </p>
        ) : null}
      </Card>

      <RecordSection title="Issued documents" rows={summary.documents} empty="No documents on file.">
        {(document: any) => (
          <>
            <span className="font-medium">{document.type.replaceAll('_', ' ').toLowerCase()}</span>
            <span className="font-mono text-xs">{document.number}</span>
            <StatusPill status={document.status} />
            <TownPill town={document.town} own={document.isOwnTown} />
          </>
        )}
      </RecordSection>

      <RecordSection title="Warrants" rows={summary.warrants} empty="No warrants.">
        {(warrant: any) => (
          <>
            <span className="font-medium">{warrant.type} warrant</span>
            <span className="font-mono text-xs">{warrant.number}</span>
            <StatusPill status={warrant.status} />
            <TownPill town={warrant.town} own={warrant.isOwnTown} />
          </>
        )}
      </RecordSection>

      <RecordSection title="Citations" rows={summary.citations} empty="No citations.">
        {(citation: any) => (
          <>
            <span className="font-mono text-xs">{citation.number}</span>
            <span className="tabular-nums">L${citation.fineTotal}</span>
            <StatusPill status={citation.status} />
            <TownPill town={citation.town} own={citation.isOwnTown} />
          </>
        )}
      </RecordSection>

      <RecordSection title="Registered vehicles" rows={summary.vehicles} empty="No vehicles.">
        {(vehicle: any) => (
          <>
            <span className="font-mono font-medium">{vehicle.plate}</span>
            <span className="text-muted">
              {[vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
            </span>
            {vehicle.stolen ? <StatusPill status="STOLEN" /> : null}
            <TownPill town={vehicle.town} own={vehicle.isOwnTown} />
          </>
        )}
      </RecordSection>
    </div>
  )
}

function RecordSection({
  title,
  rows,
  empty,
  children,
}: {
  title: string
  rows: any[]
  empty: string
  children: (row: any) => React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3 text-sm">
              {children(row)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StatusPill({ status }: { status: string }) {
  const bad = ['REVOKED', 'SUSPENDED', 'ACTIVE', 'UNPAID', 'STOLEN', 'EXPIRED'].includes(status)
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
        bad ? 'bg-danger/15 text-danger' : 'bg-ok/15 text-ok'
      }`}
    >
      {status.toLowerCase()}
    </span>
  )
}

function TownPill({ town, own }: { town: any; own: boolean }) {
  return (
    <span className="ml-auto text-xs text-muted">
      {town.name}
      {own ? ' (this town)' : ''}
    </span>
  )
}

function PlateResults({ results }: { results: any[] }) {
  if (results.length === 0) return <p className="text-sm text-muted">No registration on that plate.</p>

  return (
    <ul className="space-y-3">
      {results.map((vehicle) => (
        <li key={vehicle.id}>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg font-semibold">{vehicle.plate}</span>
              {vehicle.stolen ? <StatusPill status="STOLEN" /> : null}
              <StatusPill status={vehicle.registrationStatus} />
              <TownPill town={vehicle.town} own={vehicle.isOwnTown} />
            </div>
            <p className="mt-2 text-sm text-muted">
              {[vehicle.year, vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
              {vehicle.registeredTo ? ` · registered to ${vehicle.registeredTo.name}` : ''}
              {vehicle.insured ? '' : ' · uninsured'}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  )
}

function NameResults({ results }: { results: any[] }) {
  if (results.length === 0) return <p className="text-sm text-muted">Nobody by that name.</p>

  return (
    <ul className="space-y-2">
      {results.map((person) => (
        <li key={person.avatarId}>
          <Card>
            <p className="font-medium">{person.name}</p>
            <p className="text-sm text-muted">
              {person.slUsername} · {person.primaryTown.name}
              {person.alsoIn.length > 0 ? ` and ${person.alsoIn.length} more town(s)` : ''}
            </p>
            {person.flags.length > 0 ? (
              <p className="mt-2 text-sm font-medium text-danger">{person.flags.join(' · ')}</p>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  )
}
