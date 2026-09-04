import { db } from '@/lib/db'
import { jsonOk } from '@/lib/http'

/**
 * Readiness probe. Answers the two questions that actually go wrong in a fresh
 * environment: is the app serving, and can it reach the database?
 *
 * Deliberately says nothing about which database or why a check failed —
 * that detail belongs in the server log, not on an unauthenticated endpoint.
 */
export async function GET() {
  const started = Date.now()

  let database: 'ok' | 'unreachable' = 'ok'
  try {
    await db.$queryRaw`SELECT 1`
  } catch (error) {
    database = 'unreachable'
    console.error('[health] database check failed:', error)
  }

  const configured = {
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    SL_BRIDGE_SECRET: Boolean(process.env.SL_BRIDGE_SECRET),
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
  }

  const ready = database === 'ok' && Object.values(configured).every(Boolean)

  return jsonOk(
    { ready, database, configured, latencyMs: Date.now() - started },
    ready ? 200 : 503,
  )
}
