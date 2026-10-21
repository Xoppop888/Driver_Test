# DrivePrep backend infrastructure

This document covers only the **Cloudflare Worker + Supabase backend**. For the complete Russian step-by-step setup, see [`DEPLOY-RU.md`](DEPLOY-RU.md).

## What is enforced

| Access state | Per Subject 1 or 4 | Reset / repeat behavior |
|---|---:|---|
| Free | **50 questions per Shanghai calendar day** | The first request atomically saves a deterministic 50-ID pool in `daily_question_usage`. Any repeat for the same `installationId`, Subject, and Asia/Shanghai date returns the **same questions and same `remaining`**; it does not spend or reset quota. |
| Premium | **100 questions** | No daily limit. A valid bearer session returns the deterministic 100-question static bank for that Subject. |

The imported bank has exactly **100 static questions per Subject**. The import script deterministically picks them from `data/questions.json`; it preserves `image_url` paths exactly and never touches other files or image assets.

`GET /v1/questions` is deliberately a **practice** endpoint. It returns `correct_index` / `correct_indices` behind the Worker access gate so the existing practice client can score locally. There is no backend exam session or answer-submission implementation in this backend.

## Files

| Path | Purpose |
|---|---|
| `worker/src/index.ts` | CORS, API routing, validation, session/code hashing calls, Supabase REST RPC client |
| `worker/src/crypto.ts` | SHA-256 hashing with pepper, opaque tokens, code generation, constant-time admin key comparison |
| `worker/wrangler.jsonc` | Worker deployment configuration |
| `supabase/migrations/20261021000000_driveprep_access.sql` | Tables, RLS/grants, private security-definer RPCs, atomic daily quota logic |
| `supabase/scripts/import-questions.mjs` | Deterministic 100-per-subject import from `data/questions.json` |
| `.github/workflows/deploy-worker.yml` | Optional main-branch Worker deployment workflow |

## Supabase setup

1. Create a Supabase project. Keep its **service-role key server-side only**.
2. Apply `supabase/migrations/20261021000000_driveprep_access.sql` using the Supabase CLI migration workflow or SQL editor.
3. Validate the deterministic selection (does not write):

   ```bash
   cd /home/ubuntu/driveprep
   node supabase/scripts/import-questions.mjs
   ```

4. Import the static bank with an administrator/service-role environment. This sends 200 records through Supabase REST and performs idempotent upserts:

   ```bash
   SUPABASE_URL='https://YOUR_PROJECT.supabase.co' \
   SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVICE_ROLE_KEY' \
   node supabase/scripts/import-questions.mjs --write
   ```

The migration enables RLS, revokes all `PUBLIC`/`anon`/`authenticated` table and RPC privileges, and sets restrictive default ACLs for future tables/functions created by its owner. Only `service_role` may call the private, `security definer` RPCs. Each such function pins `search_path = ''`; all table names use the explicit `public.` schema and ordinary built-in calls use `pg_catalog.` qualification. The browser must never receive a Supabase key for this backend.

### Atomic server-side operations

| RPC (service-role only) | Guarantees |
|---|---|
| `redeem_access_code` | Locks one code, rejects used/expired codes, upgrades the installation, and creates a session atomically. |
| `get_session_entitlement` | Validates a hashed opaque token and returns only entitlement data. |
| `issue_question_access` | Uses `Asia/Shanghai` in the transaction; locks the user and daily row; persists the free 50-ID daily pool; returns all 100 for premium. |
| `get_question_bank` | Returns only the requested ordered records, including practice answer fields, through the Worker gate. |
| `create_access_code_batch` | Saves only peppered SHA-256 hashes and creates a batch atomically. |

## Worker local setup

```bash
cd /home/ubuntu/driveprep/worker
cp .dev.vars.example .dev.vars
# Edit .dev.vars; use real values only in the untracked copy.
npm ci
npm run typecheck
npm run dev
```

Required Worker runtime variables:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | `https://<project>.supabase.co` URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used for Supabase REST RPCs |
| `CODE_PEPPER` | At least 32 random characters. Code and session hashes depend on it; rotating it invalidates outstanding codes/sessions. |
| `ADMIN_KEY` | Long admin secret (maximum 256 chars) checked with a constant-time comparison for batch creation. |
| `CORS_ORIGINS` | Public Worker variable configured in `worker/wrangler.jsonc`; comma-separated **exact** origins only. Wildcards are not supported. |

For deployed secrets, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CODE_PEPPER`, and `ADMIN_KEY` with `wrangler secret put <NAME>` from `worker/`; do not add secrets to `wrangler.jsonc`. `CORS_ORIGINS` is a non-secret variable in that config. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub repository secrets only if using the optional workflow. No deployment is performed by this repository setup.

## HTTP API contract

All non-2xx errors have the form:

```json
{ "error": "Human-readable message.", "code": "machine_readable_code" }
```

`Origin` requests are allowed only when exactly listed in `CORS_ORIGINS`; the Worker supports CORS `OPTIONS` preflight. Responses are `Cache-Control: no-store`.

| Method and endpoint | Request | Success response |
|---|---|---|
| `GET /health` (also `/v1/health`) | — | `{ "ok": true, "service": "driveprep-access-api" }` |
| `POST /v1/access/redeem` | `{ "code", "installationId" }` | `{ "ok": true, "token", "expiresAt", "status": "premium" }` |
| `GET /v1/access/session` | `Authorization: Bearer <token>` | `{ "unlocked": true|false, "expiresAt": "..."|null }` |
| `GET /v1/questions?subject=1\|4&installationId=...` | Optional `Authorization: Bearer <token>` | `{ "questions", "remaining", "resetAt", "premium" }` |
| `POST /v1/admin/access-codes` | `X-Admin-Key: <ADMIN_KEY>` and `{ "count" (1–100), "expiresAt"?, "note"? }` | `{ "codes": ["DP-…"] }` |

`installationId` is a client-generated identifier (8–128 characters; permitted characters are alphanumeric plus `.`, `_`, `:`, `-`). It identifies free usage only. Premium requests require a valid bearer session bound to the same `installationId`; the ID without a session never grants premium access. Keep the successful redeem token private.

For free calls, the first `GET /v1/questions` for an installation + subject + Shanghai date creates a server-side user record and a daily usage record. It returns at most 50 questions and `remaining` as the size of that stable daily pool (normally `50`). A later fetch returns the persisted pool and exactly the same `remaining` rather than issuing a fresh set or presenting a misleading zero while questions remain available. Premium responses have `remaining: null` and `resetAt: null` because their 100-question bank has no daily quota.

## Access code lifecycle

The admin endpoint generates 128-bit random `DP-…` codes. It hashes normalized code input as SHA-256 with `CODE_PEPPER` before calling Supabase; plaintext codes are never put in a table and are returned only once in the admin response. `expiresAt` is an optional **redemption deadline** for codes. Successful redemption creates a 30-day opaque bearer session; each valid use extends it by another 30 days. A cleared browser token cannot be recovered through `installationId` alone; the user must contact an administrator for a replacement session/code.
