import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/http'
import { withBridge } from '@/lib/sl/guard'
import { isSlUuid } from '@/lib/sl/bridge'
import { normalizeSlUsername } from '@/lib/sl/username'
import { claimCodeForDelivery } from '@/lib/auth/verification'

const schema = z.object({
  /** llDetectedKey — the avatar who touched the terminal. */
  avatarUuid: z.string().refine(isSlUuid, 'Not a Second Life key.'),
  /** llGetUsername of that avatar. The grid supplies it; the user cannot forge it. */
  avatarUsername: z.string().min(2).max(63),
  /** llGetDisplayName, cosmetic. */
  avatarDisplayName: z.string().max(120).optional(),
  region: z.string().max(120).optional(),
})

/**
 * "Does this avatar have a code waiting?"
 *
 * Called by a City Link verification terminal when someone touches it. The
 * object reports the toucher's UUID and username as the *grid* reports them —
 * a resident cannot lie to llGetUsername about who they are. That is the whole
 * identity proof: we hand the code back over a signed channel, and the object
 * IMs it to that avatar and nobody else.
 *
 * Note what this does not do: it never confirms or denies that a code exists
 * for an avatar other than the toucher. Touching the terminal as yourself only
 * ever reveals your own pending code.
 */
export async function POST(request: Request) {
  return withBridge(request, schema, async ({ objectKey, body }) => {
    const slUsername = normalizeSlUsername(body.avatarUsername)

    const claim = await claimCodeForDelivery({
      slUsername,
      slUuid: body.avatarUuid,
      displayName: body.avatarDisplayName ?? null,
      objectKey,
    })

    if (!claim.ok) {
      if (claim.reason === 'no_pending_code') {
        return jsonOk({
          delivered: false,
          reason: 'no_pending_code',
          message:
            'No City Link verification is waiting for you. Start signup on the website first, then touch me again.',
        })
      }
      return jsonOk({
        delivered: false,
        reason: claim.reason,
        message: 'That verification expired. Request a new code on the website.',
      })
    }

    return jsonOk({
      delivered: true,
      code: claim.code,
      purpose: claim.purpose,
      /** Ready-to-say line, so the script does not have to compose copy. */
      message: `City Link verification code: ${claim.code} — type it on the website within 10 minutes. Never give this code to anyone.`,
    })
  })
}

export async function GET() {
  return jsonError(405, 'method_not_allowed', 'POST a signed body.')
}
