---
name: issue-document
description: Add a new issued-document type to City Link — an ID, permit, licence, or plate that a town issues and other towns can find. Use when asked to add a document type, a permit, a licence class, or printable document output.
---

# Adding an issued document type

Documents are the artifacts towns put into the world: ID cards, driver's
licences, weapon permits, business licences, plates. They are the reason
cross-town search works, so they follow one shape.

## 1. The enum

Add the type to `DocumentType` in `prisma/schema.prisma`. Do not create a new
model — `IssuedDocument` is deliberately one table with a typed `data` payload,
so a global search is one query instead of eight.

```prisma
enum DocumentType {
  ID_CARD
  DRIVERS_LICENSE
  // ...
  YOUR_NEW_TYPE
}
```

Then `npx prisma format && npx prisma generate`.

## 2. The payload shape

Type-specific fields go in `data` (Json). Define its TypeScript shape in
`src/lib/records/document-types.ts` and validate with a zod schema at the issue
boundary — `data` is unchecked at the database level, so the schema is the only
thing keeping it honest.

Keep out of `data` anything that must be *searchable*: promote it to a column.

## 3. Frozen fields

Capture `holderName` (and anything else printed on the document) at issue time.
The document must still read correctly after the citizen file is edited, or
after the issuing town deletes it outright.

Always set `slAvatarId` from the citizen at issue time. Without it the document
disappears from cross-town search the moment the citizen row goes.

## 4. Numbering

Document numbers are unique per `(townId, type, number)` and are shown to
players, so they should look like something a clerk would type. Follow the
existing convention: `<TOWN PREFIX>-<TYPE CODE>-<SEQUENCE>`, e.g.
`ASH-DL-004182`.

## 5. Permissions

Issuing is `documents.issue`; revoking is `documents.revoke`. If the new type
needs a narrower grant, add a key to `PERMISSIONS` in `src/lib/permissions.ts`
and check it in the route — remember a role holding `documents.*` picks up new
keys in that domain automatically.

## 6. Search and alerts

If the type should raise an officer-safety alert when suspended or revoked, add
it to the `alerts` block in `src/lib/records/global-search.ts`. Today only a
suspended or revoked driver's licence does.

## 7. Verify

```bash
npx prisma generate && npm run build && npm test
```
