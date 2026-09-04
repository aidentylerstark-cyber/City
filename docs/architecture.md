# Architecture

## The three layers

City Link's data model splits into three layers, and nearly every design
question resolves by asking which layer something belongs to.

```
┌──────────────────────────────────────────────────────────────┐
│  1. IDENTITY (global, permanent)                             │
│                                                              │
│     SLAvatar ──1:1── Account ──── Session                    │
│        │                 │                                   │
│        │                 └─── ProductLicense                 │
│        │                                                     │
└────────┼─────────────────────────────────────────────────────┘
         │  every record below points here
┌────────┼─────────────────────────────────────────────────────┐
│  2. TOWN (scoped, sovereign)                                 │
│        │                                                     │
│     Town ─── Role ─── MemberRole ─── TownMembership          │
│        │                                                     │
│        ├─── JoinRequest, TownInvite                          │
│        └─── Department, Unit, Shift, DispatchCall, Report     │
│                                                              │
└────────┼─────────────────────────────────────────────────────┘
┌────────┼─────────────────────────────────────────────────────┐
│  3. RECORDS (town-owned, globally discoverable)              │
│        │                                                     │
│     Citizen, IssuedDocument, Citation, Warrant, Vehicle,     │
│     Business  —  each carries townId AND slAvatarId          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Layer 1 — Identity

`SLAvatar` is the anchor. It is created the moment someone proves control of a
Second Life avatar with an in-world code, and it is **never deleted**. It holds
the SL username (lowercased, the permanent login name) and the avatar UUID,
learned from the in-world object during verification.

`Account` hangs off it — one per avatar — and carries email, City Link username,
and password. Accounts can be deleted; avatars cannot.

**Why the split matters.** If records keyed to `Account`, deleting an account
would orphan every licence that account's avatar was ever issued. Keying to
`SLAvatar` means the identity outlives the login.

### Layer 2 — Town

Towns are sovereign. Each has its own `Role` rows with their own permission
lists; a role in Ashford means nothing in Rockport. There is no cross-town
admin, no shared roster, and no way to escalate from one town into another.

A member's effective permissions are the union of their roles' keys. `*` grants
everything and belongs to the Owner role alone. Domain wildcards (`citizens.*`)
expand at check time, not at grant time — so adding a new permission key joins
existing `domain.*` roles deliberately, and never widens a role that listed keys
individually.

Role **hierarchy** is by priority number: lower outranks higher, Owner is 0. A
member may only act on roles strictly below their own best role. Without that
rule, an Administrator promotes themselves past the Owner.

### Layer 3 — Records

This is where the product's central promise lives.

A record is **owned by the town that created it**: `townId` cascades on delete,
and the town can revoke or delete it at will. But it also carries
**`slAvatarId`**, denormalised at creation and never cleared.

That second field is the entire cross-town feature:

- `citizenId` is `onDelete: SetNull`. When Ashford deletes its citizen file for
  Dana Reyes, the licence Ashford issued keeps its `slAvatarId`.
- A deputy in Rockport searching for that avatar still finds the licence.
- Display fields like `holderName` are frozen at issue time, so the document
  still reads correctly with no citizen row behind it.

**Towns own their citizen files; the documents they put into the world outlive
them.**

## Cross-town visibility

Two rules govern what a global search returns, both implemented by
`visibilityFilter` in `src/lib/records/global-search.ts`:

1. A town with `shareRecords = false` goes dark — its records never appear in
   anyone else's results. It can still search others. The asymmetry is
   deliberate: opting out of publishing is a choice about your own data, not
   about everyone else's.
2. The searching town always sees its own records, dark or not.

The viewer's town id comes from their *membership*, resolved server-side — never
from a query string. Otherwise anyone could name a town they do not belong to
and read its private records.

## Authentication

Three steps, each gating the next:

1. **Identify.** The user names an SL username. The server queues a code, stores
   only its SHA-256, and says nothing about whether that avatar already has an
   account — that would make the endpoint an account oracle.
2. **Verify.** An in-world object reports the toucher's UUID and username *as
   the simulator reports them* and receives the plaintext code over a signed
   channel, which it IMs to that avatar. Success creates or updates the
   `SLAvatar` and mints a 15-minute claim token.
3. **Register.** The claim token is exchanged for an account. It is the only
   thing that authorises this step, so there is no path to an account that skips
   step 2.

The plaintext code is **never stored and never held in memory**. It is derived
on demand from the row id and `AUTH_SECRET`
(`deriveVerificationCode` in `src/lib/crypto.ts`), so any instance can reproduce
it while nobody holding only the database can — a leaked dump or read replica
yields nothing.

An earlier draft kept the plaintext in a module-level `Map`. That was wrong: it
assumed the endpoint issuing a code and the bridge endpoint delivering it share
one process, which is false on serverless and false in dev, where routes are
separate bundles. Derivation removes the assumption entirely.

Passwords use scrypt from the Node standard library at the OWASP-recommended
parameters. No native build step.

Sessions are opaque random tokens in an httpOnly cookie; only the SHA-256 is
stored. `lastActiveAt` is written at most hourly, so a page view is not a write.

## The Second Life bridge

See [`second-life-setup.md`](second-life-setup.md) for the protocol and the
threat model.

## Why these choices

**PostgreSQL, not SQLite.** Cross-town search uses array columns
(`Role.permissions`, `Citizen.flags`), case-insensitive `contains`, and
compound descending indexes. All of that is Postgres.

**Server components by default.** Authorization happens where the data is
fetched, so there is no window in which a client holds data it should not.

**One `IssuedDocument` table, not one per document type.** A global search is
then one query instead of eight, and adding a document type is an enum value
rather than a migration. Type-specific fields live in a validated `data` JSON
payload; anything that must be *searchable* gets promoted to a column.

**SSE for dispatch, not WebSockets.** Dispatch is almost entirely
server→client. SSE survives proxies, reconnects on its own, and needs no second
server.
