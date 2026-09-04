# City Link

**The management system for Second Life communities.**

Real-time dispatch, citizen and business records, automated document generation,
a report builder, personnel scheduling — and a record that follows an avatar
across every town on the grid.

---

## What makes it different

Your account is your **avatar**. You type your Second Life username, an in-world
terminal IMs you a code, and from then on your record is yours — not a name you
typed into a form.

Towns stay **sovereign**. Every town runs its own roles and permissions, and can
delete anything it owns. There is no shared admin and no shared roster.

Records **travel**. A licence issued in Ashford resolves in Rockport. Get pulled
over in a community you have never visited and the deputy finds your most recent
licence, your unpaid citations, and any active warrant — because every record
carries the avatar it belongs to, not just the town that wrote it.

---

## Quick start

```bash
git clone <this repo> && cd City
npm install
docker compose up -d          # Postgres on port 5433
cp .env.example .env          # then fill in the secrets below
npm run setup                 # db:push + db:seed
npm run dev                   # http://localhost:3000
```

City Link is **one process** — the pages and the API are the same Next.js app.
There is no separate backend to start. Check it came up healthy with
`npm run health`.

Full walkthrough, including how to sign up locally without Second Life and how
to deploy a public preview: [`docs/running.md`](docs/running.md).

Generate the two secrets with `openssl rand -base64 48`:

| Variable | What it does |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Signs session claim tokens |
| `SL_BRIDGE_SECRET` | Shared with the in-world objects; signs every bridge request |
| `NEXT_PUBLIC_APP_URL` | Public base URL the LSL objects call back to |

### Try the cross-town scenario

The seed builds it. Sign in as `rory@example.com` (password
`citylink-dev-password`), open **Rockport → Global search**, and look up
`dana.reyes`. Ashford's driver's licence comes back next to Rockport's own
active warrant.

---

## Setting up Second Life

1. Create a prim, drop in `lsl/citylink_verifier.lsl`.
2. Set `CITYLINK_URL` to your deployment and `BRIDGE_SECRET` to your
   `SL_BRIDGE_SECRET`.
3. Rez it somewhere public. Residents touch it (or say `!citylink` nearby) to
   receive their signup code.
4. For customers, do the same with `lsl/citylink_deed.lsl` — that object
   registers their product licence and unlocks town creation.

Full walkthrough, including the security model and what to do if the secret
leaks: [`docs/second-life-setup.md`](docs/second-life-setup.md).

---

## How signing up works

```
  You                    City Link                  Second Life
   │                         │                           │
   ├─ "I am john.doe" ──────►│                           │
   │                         ├─ queues a code            │
   │                                                     │
   ├──────── touch the verification terminal ───────────►│
   │                         │◄── signed: "john.doe,     │
   │                         │      key abc-123"         │
   │                         ├─ hands the code back ────►│
   │◄──────────────── IM: "your code is 7K2M9Q" ─────────┤
   │                         │                           │
   ├─ "7K2M9Q" ─────────────►│  verified — set your      │
   │                         │  email and password       │
```

Someone who types your username into the website gets nothing: the code is
delivered to *you*, in-world, by the grid.

---

## Documentation

- [`docs/running.md`](docs/running.md) — running it locally, signing up without
  the grid, and deploying a public preview
- [`docs/architecture.md`](docs/architecture.md) — the three-layer model, and
  why records key to avatars
- [`docs/second-life-setup.md`](docs/second-life-setup.md) — in-world objects and
  the bridge protocol
- [`docs/roadmap.md`](docs/roadmap.md) — what is built and what is next
- [`CLAUDE.md`](CLAUDE.md) — conventions for working in this codebase

## Status

Built and working: avatar verification, accounts and sessions, product licences,
town creation, the town directory with join requests and approvals, per-town
roles and permissions, and cross-town search for documents, citations, warrants,
and plates.

Modelled in the database with permissions defined, interfaces not yet built:
dispatch, citizen files, document issuing, the report builder, and scheduling.
See the roadmap.
