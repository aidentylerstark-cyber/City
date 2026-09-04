import { cookies } from 'next/headers'
import { cache } from 'react'

import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { randomToken, sha256 } from '@/lib/crypto'

export const SESSION_COOKIE = 'citylink_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Only rewrite lastActiveAt when it is this stale, to avoid a write per request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000

export async function createSession(args: {
  accountId: string
  userAgent?: string | null
  ip?: string | null
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await db.session.create({
    data: {
      tokenHash: sha256(token),
      accountId: args.accountId,
      userAgent: args.userAgent?.slice(0, 512) ?? null,
      ip: args.ip ?? null,
      expiresAt,
    },
  })

  return { token, expiresAt }
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    expires: expiresAt,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export type CurrentUser = {
  sessionId: string
  activeTownId: string | null
  account: {
    id: string
    email: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'
    slUsername: string
    slDisplayName: string | null
    slUuid: string | null
  }
}

/**
 * Resolve the signed-in account. Cached per request so a page and its layout
 * share one database round trip.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { account: { include: { slAvatar: true } } },
  })

  if (!session) return null

  if (session.expiresAt <= new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  if (session.account.status !== 'ACTIVE') return null

  if (Date.now() - session.lastActiveAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session
      .update({ where: { id: session.id }, data: { lastActiveAt: new Date() } })
      .catch(() => {})
  }

  return {
    sessionId: session.id,
    activeTownId: session.activeTownId,
    account: {
      id: session.account.id,
      email: session.account.email,
      username: session.account.username,
      displayName: session.account.displayName,
      avatarUrl: session.account.avatarUrl,
      status: session.account.status,
      slUsername: session.account.slAvatar.slUsername,
      slDisplayName: session.account.slAvatar.slDisplayName,
      slUuid: session.account.slAvatar.slUuid,
    },
  }
})

/** For route handlers and server actions that must have a user. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new UnauthorizedError()
  return user
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Not signed in.')
    this.name = 'UnauthorizedError'
  }
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.session.delete({ where: { id: sessionId } }).catch(() => {})
  await clearSessionCookie()
}

export async function setActiveTown(sessionId: string, townId: string | null): Promise<void> {
  await db.session.update({ where: { id: sessionId }, data: { activeTownId: townId } })
}
