---
name: dispatch-realtime
description: Work on the real-time dispatch board — live unit status, drag-and-drop assignment, call timelines, and pushing state to many viewers at once. Use when building or debugging dispatch, unit status, or live updates.
---

# Real-time dispatch

The dispatch board is the one screen where several people watch the same state
at the same time. That changes what "correct" means.

## Transport

Use **Server-Sent Events**, not WebSockets. Dispatch is almost entirely
server→client; the handful of client→server actions are ordinary POSTs. SSE
survives proxies, reconnects on its own, and needs no second server.

```
src/app/api/towns/[townId]/dispatch/stream/route.ts   GET, text/event-stream
```

Authorize the stream exactly like any other route — `getTownContext` plus
`can(context, 'dispatch.view')` — then keep the town id in a closure. A stream
that reads its town from the query string on each event is a leak.

Set `export const dynamic = 'force-dynamic'` and send a comment heartbeat
(`: ping\n\n`) every 20–30 seconds, or proxies will close the connection.

## State ownership

The database is the source of truth; the stream is a notification, not the
state. On every event the client refetches or applies a versioned patch — never
reconstructs state from the event sequence alone, because a client that missed
an event while backgrounded would silently diverge.

## Drag and drop

Assigning a unit to a call is a write to `Unit.callId` plus a `DispatchCall`
timeline entry. Two rules:

- **Optimistic, but reconciled.** Move the card immediately, then let the
  authoritative update from the stream settle it. If the write fails, snap back
  and say why.
- **Keyboard reachable.** A drag-only interface locks out anyone not using a
  mouse. Every drag must have an equivalent: select unit, press a key or use a
  menu, choose call.

## The call timeline

`DispatchCall.events` is append-only JSON: `{ at, actor, kind, text }`. Never
rewrite an entry — a dispatch log that can be edited after the fact is not a
log. Corrections are new entries.

## Unit status

`UnitStatus` is an enum for a reason. `PANIC` must be visually unmissable and
must sort to the top of every list, regardless of the board's current sort.

## Permissions

- `dispatch.view` — watch the board.
- `dispatch.use` — update *your own* unit status, attach yourself to a call.
- `dispatch.manage` — create calls, assign *any* unit.

`dispatch.use` must check that the unit being modified is the caller's own
(`unit.membershipId === context.membership.id`). That check is the difference
between an officer and a dispatcher.

## Verify

```bash
npm run build && npm test
```

Test with two browser windows signed in as different members of the same town.
One window's action must appear in the other without a reload.
