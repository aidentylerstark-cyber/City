import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SL_BRIDGE_SECRET = 'test-bridge-secret'
process.env.SL_BRIDGE_MAX_SKEW = '120'
process.env.AUTH_SECRET = 'test-auth-secret'

const { bridgeSigningPayload, slSignature, verifyBridgeRequest } = await import('@/lib/sl/bridge')

const SECRET = 'test-bridge-secret'

function signedHeaders(args: {
  method: string
  path: string
  body: string
  timestamp?: string
  nonce?: string
  secret?: string
}) {
  const timestamp = args.timestamp ?? String(Math.floor(Date.now() / 1000))
  const nonce = args.nonce ?? `nonce-${Math.random()}`
  const payload = bridgeSigningPayload({
    method: args.method,
    path: args.path,
    timestamp,
    nonce,
    body: args.body,
  })

  return {
    timestamp,
    nonce,
    signature: slSignature(args.secret ?? SECRET, payload),
    objectKey: '11111111-1111-4111-8111-111111111111',
  }
}

describe('verifyBridgeRequest', () => {
  const request = { method: 'POST', path: '/api/bridge/deliver', body: '{"a":1}' }

  it('accepts a correctly signed request', () => {
    const result = verifyBridgeRequest({ ...request, headers: signedHeaders(request) })
    expect(result.ok).toBe(true)
  })

  it('rejects a request with no signature headers', () => {
    const result = verifyBridgeRequest({
      ...request,
      headers: { timestamp: null, nonce: null, signature: null, objectKey: null },
    })
    expect(result).toMatchObject({ ok: false, reason: 'missing_signature_headers' })
  })

  it('rejects a signature made with the wrong secret', () => {
    const headers = signedHeaders({ ...request, secret: 'not-the-secret' })
    expect(verifyBridgeRequest({ ...request, headers })).toMatchObject({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('rejects a body swapped after signing', () => {
    const headers = signedHeaders(request)
    const result = verifyBridgeRequest({ ...request, body: '{"a":2}', headers })
    expect(result).toMatchObject({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a signature replayed against a different path', () => {
    const headers = signedHeaders(request)
    const result = verifyBridgeRequest({ ...request, path: '/api/bridge/deed', headers })
    expect(result).toMatchObject({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a stale timestamp', () => {
    const old = String(Math.floor(Date.now() / 1000) - 600)
    const headers = signedHeaders({ ...request, timestamp: old })
    expect(verifyBridgeRequest({ ...request, headers })).toMatchObject({
      ok: false,
      reason: 'stale_timestamp',
    })
  })

  it('rejects a timestamp far in the future', () => {
    const future = String(Math.floor(Date.now() / 1000) + 600)
    const headers = signedHeaders({ ...request, timestamp: future })
    expect(verifyBridgeRequest({ ...request, headers })).toMatchObject({
      ok: false,
      reason: 'stale_timestamp',
    })
  })

  it('rejects a replayed nonce', () => {
    const headers = signedHeaders({ ...request, nonce: 'fixed-nonce-for-replay' })
    expect(verifyBridgeRequest({ ...request, headers }).ok).toBe(true)
    expect(verifyBridgeRequest({ ...request, headers })).toMatchObject({
      ok: false,
      reason: 'replayed_nonce',
    })
  })

  it('does not burn a nonce on a request that failed its signature check', () => {
    const nonce = 'nonce-not-burned-by-forgery'

    // A forged request carrying this nonce must not lock the real one out.
    const forged = signedHeaders({ ...request, nonce, secret: 'wrong' })
    expect(verifyBridgeRequest({ ...request, headers: forged }).ok).toBe(false)

    const genuine = signedHeaders({ ...request, nonce })
    expect(verifyBridgeRequest({ ...request, headers: genuine }).ok).toBe(true)
  })
})

describe('slSignature', () => {
  it('matches the nested construction the LSL scripts compute', async () => {
    const { sha256 } = await import('@/lib/crypto')
    const payload = 'POST\n/api/bridge/deliver\n1700000000\nn1\n{}'
    // signature = SHA256(secret + "|" + SHA256(secret + "|" + payload))
    const expected = sha256(`${SECRET}|${sha256(`${SECRET}|${payload}`)}`)
    expect(slSignature(SECRET, payload)).toBe(expected)
  })

  it('changes when any field of the payload changes', () => {
    const base = bridgeSigningPayload({
      method: 'POST',
      path: '/p',
      timestamp: '1',
      nonce: 'n',
      body: '{}',
    })
    const changed = bridgeSigningPayload({
      method: 'POST',
      path: '/p',
      timestamp: '1',
      nonce: 'n2',
      body: '{}',
    })
    expect(slSignature(SECRET, base)).not.toBe(slSignature(SECRET, changed))
  })
})
