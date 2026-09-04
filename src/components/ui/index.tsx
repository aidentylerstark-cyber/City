'use client'

import { cn } from '@/lib/cn'

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
      <div className="mt-2">{children}</div>
      {error ? (
        <span role="alert" className="mt-2 block text-sm text-danger">
          {error}
        </span>
      ) : null}
    </label>
  )
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base',
        'placeholder:text-muted/70 disabled:opacity-60',
        className,
      )}
    />
  )
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base',
        'placeholder:text-muted/70 disabled:opacity-60',
        className,
      )}
    />
  )
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  const variants = {
    primary: 'bg-brand text-brand-ink hover:opacity-90',
    secondary: 'border border-line bg-surface hover:bg-raised',
    ghost: 'hover:bg-raised',
    danger: 'bg-danger text-white hover:opacity-90',
  }

  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium',
        'transition disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
    />
  )
}

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success' | 'warn'
  children: React.ReactNode
}) {
  const tones = {
    info: 'border-line bg-raised text-ink',
    error: 'border-danger/40 bg-danger/10 text-danger',
    success: 'border-ok/40 bg-ok/10 text-ok',
    warn: 'border-warn/40 bg-warn/10 text-warn',
  }

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-xl border px-4 py-3 text-sm', tones[tone])}
    >
      {children}
    </div>
  )
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('rounded-2xl border border-line bg-surface p-5', className)}
    />
  )
}

/** Numbered progress rail for the three-step signup. */
export function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="flex items-center gap-2 text-xs">
      {labels.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'active' : 'todo'
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={state === 'active' ? 'step' : undefined}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold',
                state === 'done' && 'border-ok bg-ok text-white',
                state === 'active' && 'border-brand bg-brand text-brand-ink',
                state === 'todo' && 'border-line text-muted',
              )}
            >
              {state === 'done' ? '✓' : index + 1}
            </span>
            <span className={cn(state === 'todo' ? 'text-muted' : 'font-medium')}>{label}</span>
            {index < labels.length - 1 ? <span className="mx-1 text-muted">›</span> : null}
          </li>
        )
      })}
    </ol>
  )
}
