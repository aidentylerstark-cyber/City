---
name: town-module
description: Build a new module inside a town — dispatch, citizens, reports, scheduling, businesses. Use when adding a feature that lives under /t/[slug] and must respect that town's permissions.
---

# Building a town module

Every module under `/t/[slug]` follows the same skeleton, because every one of
them has to get authorization right in the same way.

## The skeleton

```
src/app/t/[slug]/<module>/page.tsx        server component, resolves context
src/app/t/[slug]/<module>/<client>.tsx    'use client' for interactivity
src/app/api/towns/[townId]/<module>/route.ts
src/lib/<module>/service.ts               queries and mutations
```

## 1. The page

Always this shape. `getTownContext` returns `null` both when the town does not
exist and when the caller is not a member, and `notFound()` renders the same for
both — a town's roster is not something outsiders get to probe.

```tsx
const user = await getCurrentUser()
if (!user) redirect('/login')

const context = await getTownContext(user.account.id, slug)
if (!context) notFound()

if (!can(context, 'module.view')) {
  // Render a plain "your role does not include this" panel, not a 403.
}
```

## 2. The API route

Resolve context from the session and the route param — never from the body:

```ts
const { townId } = await params
const context = await getTownContext(user.account.id, townId)
if (!context) return jsonError(404, 'not_found', 'You are not a member of that town.')
if (!can(context, 'module.action')) return jsonError(403, 'forbidden', '…')
```

Then scope every query by `context.town.id`. A row id from the client must be
matched *together with* the town id, so an id from another town cannot be
actioned:

```ts
where: { id: rowId, townId: context.town.id }
```

## 3. Permissions

Add keys to `PERMISSIONS` in `src/lib/permissions.ts` — usually `.view`,
`.use`/`.write`, and `.manage`. Add the domain to `PERMISSION_DOMAINS` so it
appears as a section in the role editor. Grant the new keys to the seeded
`Administrator` role in `SYSTEM_ROLES` if an admin should have them.

## 4. Navigation

Add the route to the nav in `src/app/t/[slug]/layout.tsx`, gated by its `view`
permission. `typedRoutes` is on, so the build fails if the route does not exist
— which is the point. Only add the nav entry once the page is real.

## 5. Audit

Destructive actions (delete, revoke, remove a member) write an `AuditLog` row
with `townId`, `actorId`, `action`, `targetType`, `targetId`.

## 6. Verify

```bash
npm run build && npm test
```

Then re-read your diff asking: could a member of town A reach a row in town B?
That is the bug this skeleton exists to prevent.
