# Running City Link

## There is no separate API server

This trips people up, so it is worth saying plainly: **City Link is one
process.** The pages and the API are the same Next.js app — everything under
`src/app/api/**` is served by the same server that renders the pages. `npm run
dev` starts all of it. There is no backend to launch alongside it, and no
API port to configure.

The only external dependency is PostgreSQL.

---

## Local preview

### 1. Start Postgres

```bash
docker compose up -d
```

That runs Postgres on **port 5433** (not 5432, so it will not collide with one
you already have). No Docker? Any Postgres works — just point `DATABASE_URL` at
it.

### 2. Configure

```bash
cp .env.example .env
```

Then fill in the two secrets:

```bash
# Run this twice, paste one value into each.
openssl rand -base64 48
```

```ini
DATABASE_URL="postgresql://citylink:citylink@localhost:5433/citylink?schema=public"
AUTH_SECRET="<first value>"
SL_BRIDGE_SECRET="<second value>"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Create the schema and seed

```bash
npm install
npm run setup      # db:push + db:seed
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000.

### 5. Check it is actually healthy

```bash
npm run health
```

```json
{ "ready": true, "database": "ok",
  "configured": { "AUTH_SECRET": true, "SL_BRIDGE_SECRET": true, "DATABASE_URL": true } }
```

`ready: false` tells you which half is wrong: `database: "unreachable"` means
Postgres is not up or `DATABASE_URL` is wrong; a `false` in `configured` means a
missing secret.

### Signing in

The seed creates three accounts, all with the password
`citylink-dev-password`:

| Email | Who |
| --- | --- |
| `ash@example.com` | Owns Ashford, licensed for 2 towns — "Create a town" is unlocked |
| `rory@example.com` | Owns Rockport, allowance used up, 1 join request waiting |
| `dana@example.com` | Member of Ashford, no license |

Sign in as Rory, open **Rockport → Global search**, and look up `dana.reyes`.
Ashford's driver's license comes back next to Rockport's own active warrant.

---

## Signing up locally (without Second Life)

A fresh signup needs an in-world object to deliver the code, and a prim cannot
reach your laptop. So there is a stand-in:

```bash
# 1. On the website, enter an SL username and press "Send my code".
# 2. Then, in a second terminal:
npm run sl:deliver -- casey.lin
```

```
Touching the verification terminal as Casey Lin…

  ┌───────────────────────┐
  │   CODE:  5G1Z6X       │
  └───────────────────────┘
```

Paste it into the page and finish signup.

**This is not a bypass.** The script builds the same payload the LSL scripts
build, signs it with the same nested keyed hash, and POSTs to the same
`/api/bridge/deliver` with the same four headers. Every check runs for real —
signature, clock skew, nonce replay, rate limit. If it works, your bridge works.
Point it at a wrong secret and it fails exactly as a misconfigured prim would.

To unlock town creation, register a license the same way:

```bash
SL_FAKE_ALLOWANCE=3 npm run sl:deed -- casey.lin
```

---

## Public preview (and the one thing that needs it)

Everything above works on localhost **except the real in-world flow**. Second
Life objects call *into* your app over HTTPS, so for a prim on the grid to reach
you, the app needs a public URL.

### Deploying

Any Node host works. The app builds to a standard Next.js output:

```bash
npm run build
npm start
```

For a preview environment, the shortest path is a platform with a managed
Postgres — Vercel + Neon, Railway, Render, Fly. Set the same four environment
variables, and point `NEXT_PUBLIC_APP_URL` at the deployed URL.

Run the schema against the production database once before first boot:

```bash
DATABASE_URL="<production url>" npm run db:push
```

Do **not** seed production — the seed creates accounts with a known password.

### Then wire up the objects

In both `lsl/citylink_verifier.lsl` and `lsl/citylink_deed.lsl`:

```lsl
string CITYLINK_URL  = "https://your-deployment.example.com";  // no trailing slash
string BRIDGE_SECRET = "<the same SL_BRIDGE_SECRET>";
```

Rez the verifier somewhere public. Touch it. If the bridge is wired correctly
you get an IM; if not, the object tells you the HTTP status. See
[`second-life-setup.md`](second-life-setup.md) for the protocol and the
troubleshooting table.

### One caveat on serverless

Two caches are currently in memory: the bridge's replay-nonce window and the
rate limiter. On a single server that is correct. On serverless, where each
request may hit a different instance, they degrade to per-instance — replay
protection and rate limits get weaker, though neither becomes unsafe on its own
(signatures and clock skew still hold, and codes are still hashed and
attempt-capped). Move both behind Redis before a real launch; each is one
function, in `src/lib/sl/bridge.ts` and `src/lib/rate-limit.ts`.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Can't reach database server` | Postgres is not running, or `DATABASE_URL` has the wrong port — this project uses **5433** |
| `Cannot find module './xxx.js'` from the dev server | `next build` was run while `next dev` was live and overwrote `.next`. Stop both, `rm -rf .next`, restart |
| Signup stuck on "collect your code" | Nothing has delivered it yet. Run `npm run sl:deliver -- <username>` |
| `sl:deliver` says `bad_signature` | `SL_BRIDGE_SECRET` in your shell differs from the running server's |
| `sl:deliver` says `no_pending_code` | Request the code on the website first; codes expire after 10 minutes |
| "Create a town" shows LOCKED | No license, or the allowance is used. `npm run sl:deed -- <username>` |
| Health returns 503 | Read `configured` in the response — it names the missing piece |
