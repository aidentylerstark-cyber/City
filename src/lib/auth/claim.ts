import { env } from '@/lib/env'
import { hmacSha256, safeEqual } from '@/lib/crypto'

/**
 * A short-lived, stateless proof that "the person holding this token just
 * verified control of avatar X".
 *
 * It bridges the two halves of signup: the code redemption ends here, and the
 * account-details form starts here. Stateless because it is single-purpose and
 * expires in minutes — there is nothing worth a database row.
 *
 * Format: base64url(payloadJson).hmac
 */

export type ClaimPayload = {
  /** SLAvatar id the claim is for. */
  avatarId: string
  slUsername: string
  purpose: 'SIGNUP' | 'LOGIN_RECOVERY' | 'RELINK'
  /** Unix seconds. */
  exp: number
}

const CLAIM_TTL_SECONDS = 15 * 60

export function issueClaim(payload: Omit<ClaimPayload, 'exp'>): string {
  const full: ClaimPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + CLAIM_TTL_SECONDS }
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url')
  return `${body}.${hmacSha256(env.authSecret, `claim:${body}`)}`
}

export function readClaim(token: string): ClaimPayload | null {
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null

  const body = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  if (!safeEqual(hmacSha256(env.authSecret, `claim:${body}`), signature)) return null

  let payload: ClaimPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (typeof payload?.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null
  if (!payload.avatarId || !payload.slUsername) return null

  return payload
}
