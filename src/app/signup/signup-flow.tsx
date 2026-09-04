'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, Button, Card, Field, Input, Steps } from '@/components/ui'

type Stage = 'identify' | 'code' | 'account'

const STEP_LABELS = ['Second Life', 'Code', 'Account']

/**
 * Three steps, in a fixed order, because each one gates the next:
 *
 *   1. Name the avatar     -> server queues a code
 *   2. Read it in-world    -> proves the avatar is yours, returns a claim token
 *   3. Set your details    -> exchanges the claim for an account
 *
 * The claim token is short-lived and is the only thing that authorises step 3,
 * so there is no way to reach an account without step 2.
 */
export function SignupFlow() {
  const router = useRouter()

  const [stage, setStage] = useState<Stage>('identify')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [slUsername, setSlUsername] = useState('')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [delivered, setDelivered] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [claim, setClaim] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const stageIndex = stage === 'identify' ? 0 : stage === 'code' ? 1 : 2

  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/verify/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slUsername, purpose: 'SIGNUP' }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.message ?? 'Could not start verification.')
        return
      }

      setRequestId(data.requestId)
      setExpiresAt(new Date(data.expiresAt))
      setSlUsername(data.slUsername)
      setDelivered(false)
      setStage('code')
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmCode(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/verify/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slUsername, code, purpose: 'SIGNUP' }),
      })
      const data = await response.json()

      if (!response.ok) {
        const remaining = data.details?.attemptsRemaining
        setError(
          typeof remaining === 'number' && remaining > 0
            ? `${data.message} ${remaining} attempt(s) left.`
            : (data.message ?? 'Verification failed.'),
        )
        return
      }

      if (data.accountExists) {
        setError(
          `That avatar already has a City Link account (${data.existingUsername}). Sign in instead.`,
        )
        return
      }

      setClaim(data.claim)
      setUsername((current) => current || slUsername.replace(/[^a-z0-9]/g, ''))
      setStage('account')
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ claim, email, username, password }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.message ?? 'Could not create your account.')
        return
      }

      router.push('/towns')
      router.refresh()
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8">
      <Steps current={stageIndex} labels={STEP_LABELS} />

      {stage === 'identify' ? (
        <form onSubmit={requestCode} className="mt-8 space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Who are you in Second Life?</h1>
            <p className="mt-2 text-sm text-muted">
              Enter your Second Life <strong>username</strong> — the login name, not your display
              name. We will send a code to you in-world to prove the avatar is yours.
            </p>
          </div>

          <Field
            label="Second Life username"
            hint='Like "john.doe", or a single word for older accounts.'
            error={error}
          >
            <Input
              value={slUsername}
              onChange={(event) => setSlUsername(event.target.value)}
              placeholder="john.doe"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </Field>

          <Button type="submit" disabled={busy || slUsername.trim().length < 2}>
            {busy ? 'Checking…' : 'Send my code'}
          </Button>
        </form>
      ) : null}

      {stage === 'code' ? (
        <form onSubmit={confirmCode} className="mt-8 space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Collect your code in-world</h1>
            <p className="mt-2 text-sm text-muted">
              A code is waiting for <strong>{slUsername}</strong>.
            </p>
          </div>

          <Card className="bg-raised">
            <p className="text-sm font-medium">In Second Life:</p>
            <ol className="mt-3 space-y-2 text-sm text-muted">
              <li>
                1. Touch any <strong>City Link verification terminal</strong>, or say{' '}
                <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs">!citylink</code>{' '}
                in local chat near one.
              </li>
              <li>2. It will IM you a 6-character code.</li>
              <li>3. Type it below.</li>
            </ol>
          </Card>

          <DeliveryWatcher
            requestId={requestId}
            onDelivered={(name) => {
              setDelivered(true)
              setDisplayName(name)
            }}
          />

          {delivered ? (
            <Alert tone="success">
              Code delivered to {displayName ? `${displayName} (${slUsername})` : slUsername}. Check
              your Second Life IMs.
            </Alert>
          ) : null}

          <Field label="Verification code" error={error}>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="A1B2C3"
              inputMode="text"
              autoComplete="one-time-code"
              spellCheck={false}
              maxLength={12}
              className="text-center font-mono text-2xl tracking-[0.4em]"
              required
            />
          </Field>

          <Countdown expiresAt={expiresAt} />

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || code.trim().length < 4}>
              {busy ? 'Verifying…' : 'Verify avatar'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setCode('')
                void requestCode()
              }}
            >
              Send a new code
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStage('identify')
                setError(null)
                setCode('')
              }}
            >
              Change username
            </Button>
          </div>
        </form>
      ) : null}

      {stage === 'account' ? (
        <form onSubmit={createAccount} className="mt-8 space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Set up your account</h1>
            <p className="mt-2 text-sm text-muted">
              <strong>{slUsername}</strong> is verified. These details are how you sign in from now
              on.
            </p>
          </div>

          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </Field>

          <Field label="City Link username" hint="Letters, numbers, and underscores.">
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={32}
              required
            />
          </Field>

          <Field label="Password" hint="At least 10 characters." error={error}>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
          </Field>

          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </Button>
        </form>
      ) : null}
    </div>
  )
}

/**
 * Polls until an in-world object picks the code up, so the page can confirm
 * delivery rather than leaving the user staring at an empty IM window.
 */
function DeliveryWatcher({
  requestId,
  onDelivered,
}: {
  requestId: string | null
  onDelivered: (displayName: string | null) => void
}) {
  const settled = useRef(false)

  useEffect(() => {
    if (!requestId) return
    settled.current = false

    const timer = setInterval(async () => {
      if (settled.current) return
      try {
        const response = await fetch(`/api/auth/verify/request?requestId=${requestId}`)
        if (!response.ok) return
        const data = await response.json()
        if (data.delivered) {
          settled.current = true
          onDelivered(data.displayName ?? null)
        }
        if (data.expired) settled.current = true
      } catch {
        // Transient network failure; the next tick retries.
      }
    }, 3000)

    return () => clearInterval(timer)
  }, [requestId, onDelivered])

  return null
}

function Countdown({ expiresAt }: { expiresAt: Date | null }) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => setRemaining(Math.max(0, expiresAt.getTime() - Date.now()))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  if (remaining === null) return null

  if (remaining === 0) {
    return <p className="text-sm text-warn">That code has expired. Send a new one.</p>
  }

  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)

  return (
    <p className="text-sm text-muted">
      Expires in{' '}
      <span className="font-mono tabular-nums">
        {minutes}:{String(seconds).padStart(2, '0')}
      </span>
    </p>
  )
}
