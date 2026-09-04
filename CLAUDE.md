# City Link

The management system for Second Life communities: dispatch, citizen and
business records, issued documents, and a record that follows an avatar across
every town on the grid.

## Stack

Next.js 15 (App Router, server components) · TypeScript · Prisma + PostgreSQL ·
Tailwind · Vitest. Auth, hashing, and signing are built on the Node standard
library — no native modules.

## Commands

```bash
npm run dev          # dev server
npm run build        # prisma generate + next build (this is the typecheck too)
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run db:push      # sync schema to the database
npm run db:seed      # seed the cross-town demo scenario
```

`npm run build` must pass before anything is considered done. `typedRoutes` is
on, so a `<Link>` to a route that does not exist fails the build. Never run
`next build` while `next dev` is live — they share `.next` and the dev server
breaks with `Cannot find module './xxx.js'`.

Pages and API are **one Next.js process**; there is no separate backend. The
only external dependency is Postgres (`docker compose up -d`, port 5433).
`npm run sl:deliver -- <username>` stands in for an in-world object so signup
works locally — it signs real bridge requests, it does not bypass anything.

## The three layers

Everything follows from this split, and most bugs come from crossing it:

1. **Identity (global).** `SLAvatar` is permanent — one verified Second Life
   avatar, never deleted. `Account` hangs off it and *is* deletable.
2. **Town (scoped).** Towns are sovereign. Each has its own roles and
   permissions, and may delete anything it owns. Nothing is shared between
   towns except what layer 3 publishes.
3. **Records (town-owned, globally discoverable).** A licence issued by Ashford
   is Ashford's row; Ashford may revoke it. But it carries `slAvatarId`, so a
   deputy in Rockport finds it during a traffic stop.

**The rule that follows: never key a record to an `Account`. Key it to an
`SLAvatar`.** That is what keeps a document resolving after the issuing town
deletes its citizen file.

## Authorization

- Every town-scoped route calls `getTownContext(accountId, townIdOrSlug)`.
  Never trust a town id from a request body to mean the caller belongs to it.
- Non-membership returns **404, not 403** — a 403 confirms the town exists.
- Check permissions in the route handler, not the component. Hiding a button is
  presentation.
- Scope every row lookup by town: `where: { id, townId: context.town.id }`.
- `*` belongs to the Owner role alone.

## The Second Life bridge

`/api/bridge/*` is the only door in from the grid, and everything through it is
signed. Two endpoints prove two different things:

- **`/deliver` proves identity.** The object reports the toucher as the
  simulator reports them; the code goes back by IM. Only this may create an
  account.
- **`/deed` proves ownership, weakly.** Objects get passed around, so a deed
  grants a capability (create a town), never an identity.

Assume `SL_BRIDGE_SECRET` leaks — full-perm copies happen. Every bridge endpoint
must stay safe under that assumption.

Verification codes are **derived**, not stored: `deriveVerificationCode(secret,
rowId)`. Never reintroduce process-local state for anything two routes both
need — serverless puts them in different lambdas.

The signature is `SHA256(secret + "|" + SHA256(secret + "|" + payload))`, **not
RFC 2104 HMAC**. LSL's `llSHA256String` hashes a string, and HMAC's pad bytes
can be `0x00`, which truncates it. `slSignature` in `src/lib/sl/bridge.ts` and
`sign()` in both `lsl/*.lsl` scripts are one protocol in two languages — change
them together, and know that any change breaks every object already rezzed.

## Conventions

- Comments explain *why*, especially where a decision looks arbitrary. The
  cross-town guarantees are not obvious from a field list.
- Destructive and cross-town actions write an `AuditLog` row.
- Colours come from the CSS tokens in `globals.css`; both themes are defined.
- New record types: see `.claude/skills/issue-document`.
- New town modules: see `.claude/skills/town-module`.
