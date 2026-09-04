'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, Button, Card } from '@/components/ui'

type PendingRequest = {
  id: string
  message: string | null
  createdAt: string
  name: string
  slUsername: string
}

export function JoinRequestQueue({
  townSlug,
  requests,
}: {
  townSlug: string
  requests: PendingRequest[]
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (requests.length === 0) return null

  async function decide(requestId: string, decision: 'APPROVE' | 'DENY') {
    setBusyId(requestId)
    setError(null)

    try {
      const response = await fetch(`/api/towns/${townSlug}/requests/${requestId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.message ?? 'Could not record that decision.')
        return
      }

      router.refresh()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Join requests ({requests.length})
      </h2>

      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <ul className="mt-3 space-y-3">
        {requests.map((request) => (
          <li key={request.id}>
            <Card className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{request.name}</p>
                <p className="text-sm text-muted">{request.slUsername}</p>
                {request.message ? (
                  <p className="mt-2 text-sm">&ldquo;{request.message}&rdquo;</p>
                ) : null}
              </div>

              <div className="flex gap-2">
                <Button
                  disabled={busyId === request.id}
                  onClick={() => decide(request.id, 'APPROVE')}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  disabled={busyId === request.id}
                  onClick={() => decide(request.id, 'DENY')}
                >
                  Deny
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
