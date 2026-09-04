import { NextResponse } from 'next/server'
import { ZodError, type ZodTypeAny, type output as ZodOutput } from 'zod'

export type ApiError = { error: string; message: string; details?: unknown }

export function jsonError(
  status: number,
  error: string,
  message: string,
  details?: unknown,
): NextResponse<ApiError> {
  return NextResponse.json({ error, message, details }, { status })
}

export function jsonOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status })
}

/**
 * Parse and validate a JSON body, returning a ready-made 400 on failure.
 *
 * Generic over the schema rather than its output type, so a field carrying a
 * `.default()` types as present on the way out instead of optional.
 */
export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<
  { ok: true; data: ZodOutput<S> } | { ok: false; response: NextResponse<ApiError> }
> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: jsonError(400, 'invalid_json', 'Request body must be valid JSON.') }
  }

  try {
    return { ok: true, data: schema.parse(raw) }
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        response: jsonError(400, 'invalid_body', 'Some fields were not valid.', error.flatten()),
      }
    }
    throw error
  }
}

/** Best-effort client IP, used only for rate-limit bucketing and audit trails. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
