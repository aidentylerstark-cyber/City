import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentUser } from '@/lib/auth/session'
import { SignupFlow } from './signup-flow'

export const metadata: Metadata = { title: 'Verify your avatar' }

export default async function SignupPage() {
  const user = await getCurrentUser()
  if (user) redirect('/towns')

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-14">
      <Link href="/" className="text-sm font-medium uppercase tracking-[0.2em] text-muted">
        City Link
      </Link>
      <SignupFlow />
      <p className="mt-8 text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  )
}
