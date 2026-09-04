import { env } from '@/lib/env'
import { safeEqual, sha256 } from '@/lib/crypto'

/**
 * The trust boundary between the grid and City Link.
 *
 * In-world objects are the only thing that can vouch for an avatar's identity,
 * so every request they make is signed.
 *
 * The signature is a nested keyed hash, NOT RFC 2104 HMAC:
 *
 *     signature = SHA256(secret + "|" + SHA256(secret + "|" + payload))
 *
 * That deviation is forced by the grid. Real HMAC XORs the key with 0x36/0x5c
 * pads and hashes the raw bytes, but LSL only exposes llSHA256String, which
 * hashes a UTF-8 *string* — a pad byte of 0x00 (which happens whenever the
 * secret contains '6' or '\\') would terminate the string and silently produce
 * a wrong digest. The nested form is computable in LSL and keeps the property
 * that matters here: the outer hash is keyed, so length-extension on the inner
 * digest buys an attacker nothing, and forging a signature still requires the
 * secret. See lsl/citylink_verifier.lsl for the in-world half.
 *
 * A signed request proves three things:
 *   1. It came from an object holding the shared secret (authenticity).
 *   2. The body was not tampered with in flight (integrity).
 *   3. It is recent, and has not been replayed (freshness, via nonce + skew).
 *
 * What it deliberately does NOT prove is that the object is running *our*
 * script — anyone the owner hands a full-perm copy to inherits the secret.
 * That is why object-reported ownership only ever grants a product licence,
 * never an account: an account still needs a code delivered to the avatar.
 */

export type BridgeHeaders = {
  timestamp: string | null
  nonce: string | null
  signature: string | null
  objectKey: string | null
}

export type BridgeVerification =
  | { ok: true; objectKey: string; nonce: string }
  | { ok: false; reason: string }

/**
 * The signing primitive, matched byte for byte by `sign()` in the LSL scripts.
 * Changing the separator or the nesting breaks every deployed object.
 */
export function slSignature(secret: string, payload: string): string {
  return sha256(`${secret}|${sha256(`${secret}|${payload}`)}`)
}

/** Canonical string that both sides sign. Order matters and must not change. */
export function bridgeSigningPayload(args: {
  method: string
  path: string
  timestamp: string
  nonce: string
  body: string
}): string {
  return [args.method.toUpperCase(), args.path, args.timestamp, args.nonce, args.body].join('\n')
}

/**
 * Replay guard. In-memory is correct for a single instance and honest about
 * its limits: swap `seenNonces` for Redis behind the same interface when
 * running more than one node.
 */
const seenNonces = new Map<string, number>()

function rememberNonce(nonce: string, ttlMs: number): boolean {
  const now = Date.now()
  // Opportunistic sweep; the map only ever holds one skew-window of nonces.
  if (seenNonces.size > 5000) {
    for (const [key, expiry] of seenNonces) {
      if (expiry < now) seenNonces.delete(key)
    }
  }
  const existing = seenNonces.get(nonce)
  if (existing !== undefined && existing > now) return false
  seenNonces.set(nonce, now + ttlMs)
  return true
}

export function verifyBridgeRequest(args: {
  method: string
  path: string
  body: string
  headers: BridgeHeaders
}): BridgeVerification {
  const { timestamp, nonce, signature, objectKey } = args.headers

  if (!timestamp || !nonce || !signature || !objectKey) {
    return { ok: false, reason: 'missing_signature_headers' }
  }

  const sent = Number(timestamp)
  if (!Number.isFinite(sent)) return { ok: false, reason: 'bad_timestamp' }

  const skewSeconds = Math.abs(Date.now() / 1000 - sent)
  if (skewSeconds > env.slBridgeMaxSkew) return { ok: false, reason: 'stale_timestamp' }

  const expected = slSignature(
    env.slBridgeSecret,
    bridgeSigningPayload({
      method: args.method,
      path: args.path,
      timestamp,
      nonce,
      body: args.body,
    }),
  )

  if (!safeEqual(expected, signature.toLowerCase())) {
    return { ok: false, reason: 'bad_signature' }
  }

  // Only burn the nonce once the signature checks out, so an unsigned flood
  // cannot evict real nonces from the window.
  if (!rememberNonce(nonce, (env.slBridgeMaxSkew + 60) * 1000)) {
    return { ok: false, reason: 'replayed_nonce' }
  }

  return { ok: true, objectKey, nonce }
}

export const BRIDGE_HEADERS = {
  timestamp: 'x-citylink-timestamp',
  nonce: 'x-citylink-nonce',
  signature: 'x-citylink-signature',
  objectKey: 'x-citylink-object',
} as const

export function readBridgeHeaders(headers: Headers): BridgeHeaders {
  return {
    timestamp: headers.get(BRIDGE_HEADERS.timestamp),
    nonce: headers.get(BRIDGE_HEADERS.nonce),
    signature: headers.get(BRIDGE_HEADERS.signature),
    objectKey: headers.get(BRIDGE_HEADERS.objectKey),
  }
}

/** Loose UUID check — SL keys are standard v4-shaped UUIDs. */
export function isSlUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
