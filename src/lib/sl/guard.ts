import { z } from 'zod'

import { jsonError } from '@/lib/http'
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { readBridgeHeaders, verifyBridgeRequest } from '@/lib/sl/bridge'

const REASON_MESSAGES: Record<string, string> = {
  missing_signature_headers: 'Request is not signed.',
  bad_timestamp: 'Signature timestamp is not a number.',
  stale_timestamp: 'Signature timestamp is outside the allowed window. Check the object clock.',
  bad_signature: 'Signature does not match. Check SL_BRIDGE_SECRET in the object.',
  replayed_nonce: 'This request was already processed.',
}

export type BridgeContext<T> = { objectKey: string; body: T; rawBody: string }

/**
 * Wraps a bridge route: verifies the HMAC, rate-limits by object, and parses
 * the body. Every `/api/bridge/*` handler goes through this — it is the only
 * door in from the grid.
 */
export async function withBridge<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  handler: (context: BridgeContext<z.output<S>>) => Promise<Response>,
): Promise<Response> {
  const rawBody = await request.text()
  const url = new URL(request.url)

  const verification = verifyBridgeRequest({
    method: request.method,
    path: url.pathname,
    body: rawBody,
    headers: readBridgeHeaders(request.headers),
  })

  if (!verification.ok) {
    return jsonError(401, verification.reason, REASON_MESSAGES[verification.reason] ?? 'Rejected.')
  }

  const limit = consumeRateLimit(
    `bridge:${verification.objectKey}`,
    RATE_LIMITS.bridge.limit,
    RATE_LIMITS.bridge.windowMs,
  )
  if (!limit.allowed) {
    return jsonError(429, 'rate_limited', 'This object is talking too fast. Slow down.')
  }

  let parsed: z.output<S>
  try {
    parsed = schema.parse(JSON.parse(rawBody))
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(400, 'invalid_body', 'Body failed validation.', error.flatten())
    }
    return jsonError(400, 'invalid_json', 'Body must be valid JSON.')
  }

  return handler({ objectKey: verification.objectKey, body: parsed, rawBody })
}
