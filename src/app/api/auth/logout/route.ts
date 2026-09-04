import { jsonOk } from '@/lib/http'
import { destroySession, getCurrentUser } from '@/lib/auth/session'

export async function POST() {
  const user = await getCurrentUser()
  if (user) await destroySession(user.sessionId)
  return jsonOk({ ok: true })
}
