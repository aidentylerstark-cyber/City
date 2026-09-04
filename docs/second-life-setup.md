# Second Life setup

City Link talks to the grid through two in-world objects. This is how to deploy
them, and what they can and cannot prove.

## The two objects

| Object | Script | What it proves | What it unlocks |
| --- | --- | --- | --- |
| **Verification terminal** | `lsl/citylink_verifier.lsl` | *Identity* — this avatar is who they say | Creating an account |
| **License deed** | `lsl/citylink_deed.lsl` | *Ownership* — this avatar owns the product | Creating a town |

Deploy the terminal publicly; anyone signing up needs to reach one. Deploy the
deed to customers as part of the product.

## Deploying

1. Rez a prim and drop the script inside.
2. Edit the two constants at the top:

   ```lsl
   string CITYLINK_URL  = "https://your-deployment.example.com";
   string BRIDGE_SECRET = "<the SL_BRIDGE_SECRET from your .env>";
   ```

3. For the deed, also set `PRODUCT_KEY` and `TOWN_ALLOWANCE` for the edition.
4. Keep the object **no-modify for non-owners**. Anyone who can open the script
   can read the secret.

The deed reports on touch and heartbeats every six hours. A licence that stops
reporting goes `DORMANT`, not revoked — sims go down, and a town should not
disappear because its owner's sim rebooted.

The licence follows the object: hand the deed to someone else and they inherit
it on their next touch, while the previous owner loses it. `CHANGED_OWNER`
resets the script so this happens automatically.

## The protocol

Every request from an object carries four headers:

```
X-CityLink-Timestamp   unix seconds
X-CityLink-Nonce       llGenerateKey()
X-CityLink-Signature   see below
X-CityLink-Object      llGetKey()
```

The signed payload is these five fields joined by newlines, in this exact order:

```
METHOD \n PATH \n TIMESTAMP \n NONCE \n BODY
```

And the signature is:

```
SHA256(secret + "|" + SHA256(secret + "|" + payload))
```

### Why that is not HMAC

Real RFC 2104 HMAC XORs the key against `0x36`/`0x5c` pads and hashes the raw
bytes. LSL only exposes `llSHA256String`, which hashes a UTF-8 *string* — and a
pad byte of `0x00` (which happens whenever the secret contains `6` or `\`) would
terminate the string and silently produce a wrong digest.

The nested keyed form above is computable in LSL and keeps the property that
matters: the outer hash is keyed, so length-extension on the inner digest buys
an attacker nothing, and forging a signature still requires the secret.

`slSignature()` in `src/lib/sl/bridge.ts` and `sign()` in both scripts are one
protocol in two languages. **Changing the separator, the field order, or the
nesting breaks every object already rezzed on the grid.**

### Replay protection

The server rejects a timestamp more than `SL_BRIDGE_MAX_SKEW` seconds off (120
by default) and remembers nonces for that window plus a minute. A nonce is only
burned *after* the signature verifies, so an unsigned flood cannot evict real
nonces.

The nonce cache is in memory — correct for a single instance. Running more than
one node means moving it behind Redis; the interface in `bridge.ts` is one
function.

## The threat model

**Assume `SL_BRIDGE_SECRET` leaks.** Full-perm copies get passed around, and
anyone who can open the script can read it. Every bridge endpoint is designed to
stay safe under that assumption:

- `/api/bridge/deliver` only ever reveals a code **for the avatar that touched
  the object**, and delivers it by IM to that same avatar. Holding the secret
  lets you ask "does *this* avatar have a code waiting" — it does not let you
  read anyone else's, and it cannot create an account.
- `/api/bridge/deed` grants a *capability* (create a town), never an *identity*.
  It refuses outright if the owner has no City Link account, and it can only
  attach a licence to an account that already exists.

That asymmetry is the design. Identity comes only from a code delivered to an
avatar; objects can grant capabilities, never identities.

**If the secret leaks:** rotate `SL_BRIDGE_SECRET`, redeploy both scripts, and
audit `ProductLicense` rows created since the leak. Existing accounts are
unaffected — the secret cannot mint them.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `401 bad_signature` | `BRIDGE_SECRET` mismatch, or the payload was built in the wrong field order |
| `401 stale_timestamp` | Sim clock drift, or the object queued the request during lag |
| `401 replayed_nonce` | The script reused a nonce — always call `llGenerateKey()` per request |
| `no_pending_code` | The user has not started signup on the website yet |
| Object says "could not read your username" | `llGetUsername` only answers for agents in the region |
