# TotalMed — Test Suite

Integration tests for the TotalMed backend. They run the **real application code**
(services, routes, middleware, Socket.IO handlers) against an **in-memory Postgres**,
so nothing here ever touches the production Neon database.

```bash
cd backend
npm test          # runs tests/run.mjs — 97 assertions across 9 groups
```

A non-zero exit code means at least one assertion failed.

---

## How the harness works

| Concern | Approach |
| --- | --- |
| **Database** | [PGlite](https://github.com/electric-sql/pglite) — a full Postgres compiled to WASM — started in-process and exposed over a local socket so the real `pg` driver / Prisma adapter can connect to it. |
| **Schema** | Generated at runtime from `prisma/schema.prisma` via `prisma migrate diff`, so the test DB can never drift from the real schema. |
| **App code** | The real modules are loaded (`src/services/*`, `src/routes/*`, `utils/cipher`, …). HTTP/socket tests boot the real server through the `createServer()` factory in [`src/app.js`](../src/app.js). |
| **External calls** | Only the outbound ones are stubbed — the Brevo mailer and the geo-IP lookup in `auth.service`. Everything else (including HTTP to our own test server) is real. |
| **Isolation** | Tables are `TRUNCATE`d between groups; each HTTP/socket group starts its own ephemeral server. |

Key files:

- [`tests/run.mjs`](run.mjs) — the runner; sets up the DB once, runs each group, tallies pass/fail.
- [`tests/setup.mjs`](setup.mjs) — DB bootstrap, app loading, external-call stubs, the tester helper.
- [`tests/helpers/server.mjs`](helpers/server.mjs) — starts the real app on an ephemeral port.
- [`tests/groups/*.mjs`](groups) — one file per group.

---

## Test groups

### 1. Encryption & tamper detection — `groups/encryption.mjs` (9)
The AES-256-GCM primitive in `utils/cipher.js`: round-trips, random IV per encryption,
null/empty passthrough, and — critically — that any tampering with the IV, ciphertext,
or auth tag makes `decrypt()` return `null` instead of leaking data.

### 2. Consent & data isolation — `groups/consent.mjs` (11)
The thesis's core guarantees: records are encrypted at rest; `getDecryptedRecords`
paginates and orders correctly; **one patient's records never leak to another**; the
consent filter shares only patient-approved records; expired access codes are invisible
to lookup and replaced on regeneration.

### 3. 2FA & auth at rest — `groups/auth.mjs` (16)
Password hashing (bcrypt, never plaintext), duplicate-email rejection, login success/
failure, the 2FA secret stored **encrypted** at rest, email OTP hashed/expired/cleared,
and the **TOTP verification regression** (see Findings).

### 4. Validation & regression — `groups/validation.mjs` (18)
Zod schemas for registration, login, access codes and records (password policy, 6-digit
codes, length caps, UUID checks); the cleanup job deletes only expired codes; vault-token
expiry is enforced.

### 5. Concurrent access & revoke — `groups/scenario.mjs` (8)
The two-doctors scenario: one access code per patient at a time, a code is consumed on
approval and cannot be reused, a fresh code can be issued while another doctor is viewing,
double-consume is idempotent (no crash), and patient revocation invalidates a session.

### 6. Real-time consent over Socket.IO — `groups/socket.mjs` (8)
End-to-end over real sockets + HTTP: a doctor's held-open `/access-vault` resolves only
after the **real** patient approves, returning exactly the shared records. **Security:**
forged `auth-response` events from another patient or from the doctor themselves are
rejected and never consume the code — only the owner's approval grants access.

### 7. Doctor record-write path — `groups/records.mjs` (10)
The most sensitive write. Valid token → record added (200), patient receives a
`vault-updated` event with the **decrypted** record, and the record is **encrypted at
rest**. Guards: patient/doctor mismatch → 403, expired token → 403, **revoked session →
403** (end-to-end), wrong role → 403, missing diagnosis → 400. Also: a second patient
session kicks the first (`session-replaced`).

### 8. HTTP middleware security — `groups/middleware.mjs` (15)
Against the real server: JWT auth (401/403/200, cookie + Bearer), CSRF double-submit
(missing/mismatched → 403, matching → pass, exempt routes bypass), role enforcement
(cross-role → 403, correct role admitted), and validation failures → 400 with field
details.

### 9. Rate limiters — `groups/ratelimit.mjs` (2)
`/login` returns 429 past 20 attempts; `/2fa/validate` returns 429 past 10. Runs **last**
because `express-rate-limit` counters are process-wide singletons.

---

## Findings surfaced by these tests

Writing the suite caught two real bugs in code that *appeared* to work:

- **TOTP 2FA accepted any code (auth bypass).** `otplib` v13's `verify()` became async and
  returns `{ valid }`, but the code used `if (!verify(...))` — always falsy, so every code
  passed. Fixed to `(await verify(...)).valid`; locked in by group 3.
- **Server crash on duplicate vault approval (`P2025`).** An un-awaited `accessCode.delete`
  inside an event listener threw outside any `try/catch`, taking the whole server down.
  Fixed to idempotent `deleteMany` + guarded handler; locked in by group 5.

---

## Known limitation

PGlite-over-socket cannot execute the query Prisma 7 emits when a single `findUnique`
includes **two sibling relations** (e.g. the dashboards' `appointments` *and* `user`) — it
drops the connection. Single-chain nested includes work fine. This is a **test-engine**
constraint only; real Postgres/Neon runs these queries, and the app does so in production.
Where it applies (the dashboard endpoints), the tests assert the security property that
runs *before* the query — the role gate — rather than the full payload.

---

## Adding a group

1. Create `tests/groups/<name>.mjs` exporting `async function run({ app, t })`.
   - `app` = `{ prisma, cipher, vault, auth, revocations, schemas, jwt, bcrypt, otplib }`.
   - `t` = `{ ok(cond, msg), throws(fn, msg), section(label) }`.
   - For HTTP/socket tests, `import { startAppServer } from '../helpers/server.mjs'` and
     close it in a `finally`.
2. Register it in the `groups` array in `tests/run.mjs` (keep **Rate limiters** last).
