import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth/session'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage() {
  const user = await getCurrentUser()
  if (user) redirect('/towns')

  return (
    <main className="mx-auto w-full max-w-md px-6 py-14">
      <Link href="/" className="text-sm font-medium uppercase tracking-[0.2em] text-muted">
        City Link
      </Link>
      <h1 className="mt-8 text-2xl font-semibold">Sign in</h1>
      <LoginForm />
      <p className="mt-8 text-sm text-muted">
        No account yet?{' '}
        <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
          Verify your avatar
        </Link>
      </p>
    </main>
  )
}
