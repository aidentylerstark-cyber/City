# Roadmap

## Built and working

- **Avatar verification.** Three-step signup: name an SL username, collect a
  code from an in-world terminal, set account details. Codes are hashed at rest,
  the plaintext never touches the database, and delivery is required before a
  code can be redeemed.
- **Accounts and sessions.** scrypt passwords, opaque session cookies, sign-in
  by email, City Link username, or SL username.
- **The Second Life bridge.** Signed, replay-protected endpoints for code
  delivery, licence registration, and heartbeats. Both LSL scripts.
- **Product licences.** Deeded objects register ownership and grant a town
  allowance.
- **Towns.** Creation gated by licence allowance, seeded with system roles and
  departments in one transaction.
- **The town picker.** Your towns, pending requests, a searchable public
  directory, join and request-to-join, and town creation for licence holders.
- **Per-town roles and permissions.** 38 permission keys across 13 domains,
  domain wildcards, and priority-based role hierarchy.
- **Members and join requests.** Roster with roles, approve/deny queue.
- **Cross-town search.** Avatar lookup, plate lookup, and name search across
  every sharing town, with officer-safety alerts for active warrants, stolen
  vehicles, suspended licences, and citizen flags.

## Modelled, not yet built

These have schema, permissions, and indexes in place. What they need is
interfaces and service functions.

| Module | Models ready | Notes |
| --- | --- | --- |
| **Citizen files** | `Citizen` | Create, edit, photo, flags, per-town delete |
| **Document issuing** | `IssuedDocument` | IDs, licences, permits, plates; printable output |
| **DMV** | `Vehicle` | Registration, plate issue, stolen flag |
| **Citations** | `Citation` | Charge picker, fine totals, court status |
| **Warrants** | `Warrant` | Issue, serve, recall |
| **Businesses** | `Business` | Registry, licences |
| **Dispatch** | `DispatchCall`, `Unit`, `Department` | Drag-and-drop board over SSE; see `.claude/skills/dispatch-realtime` |
| **Scheduling** | `Shift` | Roster, shift calendar |
| **Report builder** | `Report` | Template-driven forms; `fields` JSON so templates can change without migrating old reports |
| **Audit log viewer** | `AuditLog` | Rows are already written; needs a page |

## Known limits to address before scale

- **Nonce and rate-limit caches are in memory.** Correct for one instance. Move
  both behind Redis before running more than one node — each is a single
  function (`rememberNonce` in `sl/bridge.ts`, `consumeRateLimit` in
  `rate-limit.ts`).
- **Undelivered verification codes are lost on restart.** Deliberate: the
  plaintext is never persisted. Users request a new code. If this becomes
  painful, encrypt at rest with a key held outside the database rather than
  storing it plainly.
- **No email.** Password reset currently has to go through in-world
  re-verification (`LOGIN_RECOVERY`), which is arguably the better flow anyway,
  but the route is not built yet.
- **No image uploads.** `photoUrl` and `logoUrl` take URLs. Object storage is
  needed for citizen photos and town logos.
- **Global search is unpaginated** at a hard 50 rows per record type. Fine at
  current scale; needs cursors before it is not.
