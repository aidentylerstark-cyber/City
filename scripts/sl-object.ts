/**
 * Stand-in for an in-world object, for local development.
 *
 * Second Life objects cannot reach a laptop, so without this there is no way
 * to finish a signup or register a licence on localhost.
 *
 * This is NOT a bypass. It builds the exact payload the LSL scripts build,
 * signs it with the same nested keyed hash, and POSTs to the same
 * `/api/bridge/*` endpoints with the same four headers. The server cannot tell
 * it apart from a prim on the grid, and every check — signature, clock skew,
 * nonce replay, rate limit — runs for real. If this script works, your bridge
 * works; if the secret is wrong, it fails exactly as an object would.
 *
 *   npm run sl:deliver -- dana.reyes          collect a pending signup code
 *   npm run sl:deed -- ash.mayfield           register a product licence
 *   npm run sl:heartbeat -- <object-uuid>     keep a licence alive
 */

import { randomUUID } from 'node:crypto'

import { bridgeSigningPayload, slSignature, BRIDGE_HEADERS } from '../src/lib/sl/bridge'
import { normalizeSlUsername, toLegacyName } from '../src/lib/sl/username'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const SECRET = process.env.SL_BRIDGE_SECRET

if (!SECRET) {
  console.error('SL_BRIDGE_SECRET is not set. Is your .env in place?')
  process.exit(1)
}

/**
 * The object's own key. Stable across runs, like a rezzed prim's key, and
 * strictly hex — the bridge validates it as a real SL UUID.
 */
const OBJECT_KEY = process.env.SL_FAKE_OBJECT_UUID ?? '0deacc00-0000-4000-8000-0000000000d1'

/**
 * A deterministic avatar UUID per username, so re-running the script keeps
 * reporting the same "avatar" instead of minting a new one each time.
 */
function avatarUuidFor(slUsername: string): string {
  const seed = [...slUsername].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7)
  const hex = seed.toString(16).padStart(8, '0')
  return `${hex}-0000-4000-8000-${hex}0000`
}

async function post(path: string, body: Record<string, unknown>): Promise<void> {
  // llList2Json stringifies every value; mirror that so the dev path exercises
  // the same coercion the real objects rely on.
  const payload = JSON.stringify(
    Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value)])),
  )

  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = randomUUID()
  const signature = slSignature(
    SECRET!,
    bridgeSigningPayload({ method: 'POST', path, timestamp, nonce, body: payload }),
  )

  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [BRIDGE_HEADERS.timestamp]: timestamp,
      [BRIDGE_HEADERS.nonce]: nonce,
      [BRIDGE_HEADERS.signature]: signature,
      [BRIDGE_HEADERS.objectKey]: OBJECT_KEY,
    },
    body: payload,
  }).catch((error) => {
    console.error(`\nCould not reach ${BASE}. Is the dev server running?\n  ${error.message}`)
    process.exit(1)
  })

  const text = await response.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    console.error(`HTTP ${response.status} — non-JSON response:\n${text.slice(0, 400)}`)
    process.exit(1)
  }

  if (!response.ok) {
    console.error(`\n✗ HTTP ${response.status} ${data.error ?? ''}\n  ${data.message ?? text}`)
    if (data.error === 'bad_signature') {
      console.error('\n  SL_BRIDGE_SECRET here does not match the running server.')
    }
    process.exit(1)
  }

  console.log(`\n${data.message ?? JSON.stringify(data, null, 2)}`)

  if (data.code) {
    console.log(`\n  ┌───────────────────────┐`)
    console.log(`  │   CODE:  ${String(data.code).padEnd(11)}  │`)
    console.log(`  └───────────────────────┘`)
    console.log(`\n  Paste it into the signup page. Expires in 10 minutes.`)
  }
  if (data.licensed) {
    console.log(`\n  Town allowance: ${data.townAllowance}. "Create a town" is now unlocked.`)
  }
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2)

  if (!command || !argument) {
    console.error(`
Usage:
  npm run sl:deliver   -- <sl.username>    collect a pending signup code
  npm run sl:deed      -- <sl.username>    register a product licence
  npm run sl:heartbeat -- <object-uuid>    keep a licence alive
`)
    process.exit(1)
  }

  const username = normalizeSlUsername(argument)

  switch (command) {
    case 'deliver':
      console.log(`Touching the verification terminal as ${toLegacyName(username)}…`)
      await post('/api/bridge/deliver', {
        avatarUuid: avatarUuidFor(username),
        avatarUsername: username,
        avatarDisplayName: toLegacyName(username),
        region: 'Dev Sandbox',
      })
      break

    case 'deed':
      console.log(`Touching the licence deed as ${toLegacyName(username)}…`)
      await post('/api/bridge/deed', {
        ownerUuid: avatarUuidFor(username),
        ownerUsername: username,
        objectUuid: OBJECT_KEY,
        objectName: 'City Link License (dev)',
        productKey: 'citylink-standard',
        region: 'Dev Sandbox',
        townAllowance: process.env.SL_FAKE_ALLOWANCE ?? '1',
      })
      break

    case 'heartbeat':
      await post('/api/bridge/heartbeat', { objectUuid: argument, region: 'Dev Sandbox' })
      break

    default:
      console.error(`Unknown command "${command}". Expected deliver, deed, or heartbeat.`)
      process.exit(1)
  }
}

// Wrapped rather than top-level await: this file is transpiled to CommonJS,
// where top-level await is not available.
main().catch((error) => {
  console.error(error)
  process.exit(1)
})
