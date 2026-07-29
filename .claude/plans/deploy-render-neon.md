# Deploy setlist to Render (free) + Neon Postgres

## Goal
Make the song requester deployable to the public internet at $0/mo as a single
Docker container: Fastify serves both `/api/*` and the built React SPA from one
origin, with Postgres on Neon. Deliver the Dockerfile, the Render blueprint, the
production env wiring, and a deploy runbook. No feature work, no rearchitecture.

## Context
- Repo: `/Users/tannercantlay/Projects/songrequester` (remote `https://github.com/tannercantlay/song-requester.git`)
- Stack: pnpm workspace monorepo (`packages/api`, `packages/web`), TypeScript 5.6 with
  `module: NodeNext`, ESM throughout (`"type": "module"`). API is Fastify **4**
  (Kysely + `pg`, argon2, zod). Web is React 18 + Vite 5 + Tailwind 3, built with
  `tsc -b && vite build`. Migrations are `dbmate` against `db/migrations/`.
- Conventions:
  - Fastify plugins must be pinned to **Fastify-4-compatible majors**. `DECISIONS.md:12`
    logs a `FST_ERR_PLUGIN_VERSION_MISMATCH` incident from installing latest majors that
    target Fastify 5. Check a plugin's fastify peer range before installing it.
  - Relative ESM imports carry the `.js` extension (`./env.js`), required by NodeNext.
- Branch: already on `worktree-deploy-plan`. Commit there. Do **not** create another branch.
- Node: pin **22 LTS** in the image. Local dev is Node 25; `engines.node` is `>=20`.
- pnpm: **11.9.0**, matching the lockfile that `--frozen-lockfile` validates.
- Host note: the developer machine is **arm64** (Apple Silicon); Render's builders are
  amd64. Anything downloading a prebuilt binary must select by architecture.

## Constraints

These are settled. Do not revisit them.

1. **The API must run as exactly ONE instance.** `packages/api/src/sse.ts:10` holds a
   module-scope `Map<eventId, EventEmitter>`. Live queue updates are broadcast through
   in-process memory. With two instances, a guest's `POST /api/e/:token/requests` lands
   on instance A while the host's `EventSource` is held open on instance B, and the
   request **silently never appears on the admin queue** — no error, no log. Every
   deploy artifact must pin instance count to 1.

2. **Do not replace the in-memory SSE with Redis / LISTEN-NOTIFY / Supabase Realtime.**
   Explicitly considered and rejected: one host per gig does not need horizontal scale,
   and a shared bus adds a service and a new failure mode.

3. **Do not deploy to Vercel.** Vercel does deploy Dockerfiles now, but as OCI images on
   Fluid compute *functions* — capped duration (300s on Hobby) and autoscaled across
   instances. Both break constraint 1.

4. **Do not use Supabase or Render for Postgres.** Supabase free pauses after 7 days of
   database inactivity with a ~30s wake; Render free Postgres is **deleted** 30 days
   after creation. This app runs a few times a month in front of a live audience. Neon
   scales to zero and resumes in ~1s with no pause and no expiry.

5. **Web and API must be same-origin.** No CORS plugin is registered anywhere in the API
   (`WEB_ORIGIN` is used only for the Spotify OAuth redirect at
   `packages/api/src/routes/spotify.ts:68`), and auth is an httpOnly cookie plus CSRF.
   Fastify serves the built SPA itself. Do not split the frontend onto a CDN or a
   separate Render static site, and do not add `@fastify/cors` to work around it.

6. **Do not change `sslmode` handling in application code.** Neon requires
   `sslmode=require`; that belongs in the `DATABASE_URL` value set in the Render
   dashboard, not in `packages/api/src/db.ts`. Local dev keeps `sslmode=disable`
   (`DECISIONS.md`, 2026-07-03).

## Track structure — read before starting

There are **two** tracks, and the split is deliberately not three.

An earlier draft separated "app code" from "Dockerfile." That is wrong: the Dockerfile
runs `pnpm install --frozen-lockfile` and `pnpm -r build` **against the working tree**.
An agent editing `packages/api/package.json` and regenerating `pnpm-lock.yaml` while
another agent runs `docker build` produces `ERR_PNPM_OUTDATED_LOCKFILE` or compiles
half-written TypeScript. Disjoint file ownership is not sufficient when one track's
verification consumes another track's build inputs. They are one track.

Track 2 is genuinely independent: it writes only YAML and Markdown, runs no build, and
imports nothing from Track 1's files.

**Shared-resource rules for both tracks:**
- `DECISIONS.md` is owned by **Track 1 only**. If Track 2 deviates from this plan, it
  records the deviation in its commit message body instead; do not append to
  `DECISIONS.md` from Track 2.
- When committing, `git add` your **explicit owned paths only**. Never `git add -A`,
  never `git commit -a` — the tracks share one worktree and a blanket add will sweep up
  the other track's half-finished files.

## Tracks

### Track 1 — Fastify serves the SPA, plus the container image

**Owns files:** `packages/api/package.json`, `packages/api/src/server.ts`,
`packages/api/src/env.ts`, `packages/api/src/auth/plugin.ts`, `packages/api/src/sse.ts`,
`pnpm-lock.yaml`, `Dockerfile`, `.dockerignore`, `docker-entrypoint.sh`, `DECISIONS.md`

**Goal:** One Fastify process serves the API and the built React SPA on a single origin,
binds the port Render assigns, sets secure cookies in production, and ships as a Docker
image that applies migrations on boot.

**Interfaces:** (Track 2 documents these — do not rename anything here)

Static root resolution, in `server.ts`:
```ts
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDist = process.env.WEB_DIST
  ? path.resolve(process.env.WEB_DIST)
  : fileURLToPath(new URL("../../web/dist/", import.meta.url));
```
This resolves correctly in **both** layouts with no special case:
- container: `/app/packages/api/dist/server.js` → `/app/packages/web/dist/`
- local tsx: `packages/api/src/server.ts` → `packages/web/dist/`

Filesystem layout inside the image:

| Thing | Path |
|---|---|
| workdir | `/app` |
| API entry | `/app/packages/api/dist/server.js` |
| SPA assets | `/app/packages/web/dist/` |
| migrations | `/app/db/migrations` |
| entrypoint | `/app/docker-entrypoint.sh` |
| default port | `10000` (Render overrides via `$PORT`) |

**Steps:**

1. Add `"@fastify/static": "^7.0.4"` to `packages/api/package.json` dependencies.
   **Use the 7.x line** — its plugin metadata declares `fastify: '4.x'`, while 8.x
   declares `5.x` and will throw `FST_ERR_PLUGIN_VERSION_MISMATCH` at boot. Run
   `pnpm install` to update `pnpm-lock.yaml`. No type cast is needed (unlike the
   `@fastify/rate-limit` workaround at `server.ts:34`); it compiles clean under NodeNext.

2. In `env.ts`, add `PORT` to the zod schema — and only `PORT`:
   ```ts
   PORT: z.preprocess(
     (v) => (v === "" || v === undefined ? undefined : v),
     z.coerce.number().int().positive().optional(),
   ),
   ```
   The `preprocess` is load-bearing: a bare `z.coerce.number()` turns an empty-string
   `PORT` into `0`, which fails `.positive()` and crashes the process at boot.
   Leave `API_PORT`'s default at 3000 so `pnpm dev` is unaffected.
   Do **not** add `NODE_ENV` or `WEB_DIST` to the schema — read both via `process.env`,
   matching the existing pattern at `routes/auth.ts:12`. One convention, not two.

3. In `server.ts`, register `@fastify/static` after the existing route plugins:
   ```ts
   await app.register(fastifyStatic, {
     root: webDist,
     prefix: "/",
     index: ["index.html"],
     wildcard: false,
   });
   ```
   Both `wildcard: true` and `false` work here (the wildcard handler calls
   `reply.callNotFound()` on a miss, which reaches the step-4 handler either way). Use
   `false` — it is marginally cheaper per request. Know the one real consequence: with
   `wildcard: false`, `@fastify/static` globs the root **at registration time** and
   registers a route per file. If `packages/web/dist` does not exist it logs a warning
   rather than throwing, so `pnpm --filter api dev` still boots, but `/` then falls
   through to `sendFile("index.html")` → ENOENT → 500. That is expected without a web
   build; it is not a bug to chase.

4. Add an SPA fallback via `setNotFoundHandler`, so client routes like `/admin/catalog`
   and `/e/:token` survive a hard refresh:
   ```ts
   app.setNotFoundHandler((request, reply) => {
     if (request.method !== "GET" || request.url.startsWith("/api/")) {
       return reply.code(404).send({ error: "Not found" });
     }
     return reply.sendFile("index.html");
   });
   ```
   The `/api/` guard matters: unknown API routes must keep returning JSON 404s, not an
   HTML document the fetch client in `packages/web/src/api/client.ts` cannot parse.
   A single top-level handler is sufficient — none of the child plugins registered at
   `server.ts:39-45` define their own not-found handler, so nothing shadows it.

5. Change the listen call to `env.PORT ?? env.API_PORT`. Keep `host: "0.0.0.0"`.

6. In `auth/plugin.ts`, add `secure: process.env.NODE_ENV === "production"` to the
   `csrfProtection` `cookieOpts`. The session cookie at `routes/auth.ts:39` already does
   this; the CSRF cookie was missed and would otherwise be sent over plaintext.

7. In `sse.ts`, add `"X-Accel-Buffering": "no"` to the existing `reply.raw.writeHead`
   header object (`sse.ts:31`). A one-line proxy hint that stops reverse proxies from
   buffering the event stream. It does **not** change the SSE architecture, which
   constraint 2 freezes.

8. Write `.dockerignore` excluding at minimum `node_modules`, `**/node_modules`,
   `**/dist`, `.git`, `.claude`, `.env`, `.env.*` (keep `!.env.example`),
   `setlist-plan.tar.gz`, `*.md`.

9. Write a two-stage `Dockerfile`:

   **Build stage** — `FROM node:22-bookworm-slim AS build`:
   - `RUN npm install -g pnpm@11.9.0`, `WORKDIR /app`, copy the repo, then
     `RUN pnpm install --frozen-lockfile` and `RUN pnpm -r build`.
   - **Do not set `ENV NODE_ENV=production` in this stage.** It makes pnpm skip
     devDependencies, so `typescript`, `tsx`, and `vite` go missing and `pnpm -r build`
     fails. It belongs only in the runtime stage.
   - Add `RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++`
     before the install. `argon2@0.44.0` ships prebuilds for glibc *and* musl, so this is
     not about libc — it is insurance: if the prebuild for this platform/NAPI version
     ever fails to resolve, `node-gyp` falls back to a source build, and without a
     toolchain the image build dies with no recovery path.
   - Debian (not Alpine) remains the right base, simply as the best-tested prebuild target.
   - `pnpm-workspace.yaml` already declares `allowBuilds: { argon2: true, esbuild: true }`,
     so the native build is pre-approved and needs no extra flag.

   **Runtime stage** — `FROM node:22-bookworm-slim`:
   ```dockerfile
   ARG TARGETARCH
   ADD https://github.com/amacneil/dbmate/releases/download/v2.34.1/dbmate-linux-${TARGETARCH} /usr/local/bin/dbmate
   RUN chmod +x /usr/local/bin/dbmate
   ```
   `TARGETARCH` is populated automatically by BuildKit and its values (`amd64`, `arm64`)
   match dbmate's release asset names exactly. **Hardcoding `amd64` breaks every local
   build on this arm64 machine** with `exec format error`, even though it would work on
   Render.
   Then `COPY --from=build /app /app` **wholesale**. Copying the entire tree —
   node_modules included — is deliberate: pnpm's `node_modules` is a lattice of relative
   symlinks into `.pnpm`, and pruning it with `pnpm deploy` or a partial `COPY` is the
   most common way this image breaks. Docker preserves the symlinks and they stay valid
   because their targets are inside the copied tree. The larger image costs nothing on
   Render's free tier.
   Set `ENV NODE_ENV=production` (step 6 and `routes/auth.ts:39` both gate secure cookies
   on it) and `ENV PORT=10000`. Add `RUN chmod +x /app/docker-entrypoint.sh` — do not
   rely solely on the committed exec bit, whose failure mode is a bare `exec format
   error` at container start with no other signal. Finish with
   `ENTRYPOINT ["/app/docker-entrypoint.sh"]`.

10. Write `docker-entrypoint.sh` and `chmod +x` it:
    ```sh
    #!/bin/sh
    set -e
    [ -n "$DATABASE_URL" ] || { echo "DATABASE_URL is not set" >&2; exit 1; }
    dbmate --wait --wait-timeout 60s --url "$DATABASE_URL" \
      --migrations-dir /app/db/migrations --no-dump-schema up
    exec node /app/packages/api/dist/server.js
    ```
    Every flag here earns its place:
    - `--wait --wait-timeout 60s` — **required because of Neon's scale-to-zero.** If the
      compute is suspended, the first connect can fail before the ~1s resume finishes;
      without `--wait`, `set -e` aborts and Render crash-loops the deploy behind an
      opaque `connection refused`.
    - `--no-dump-schema` — dbmate's schema dump shells out to `pg_dump`, which is **not
      present in `node:22-bookworm-slim`**. (The container filesystem is writable, so
      do not "simplify" this flag away after discovering that.)
    - `exec` — makes node PID 1 so it receives Render's SIGTERM on redeploy.
    - Running migrations at boot rather than as a Render pre-deploy step is safe **only**
      because of constraint 1 (single instance): there is no concurrent-migration race.

11. Append a dated entry to `DECISIONS.md` for any deviation from this plan.

**Acceptance:**
- `pnpm -r build` succeeds from the repo root.
- With `packages/web/dist` built: `/` returns the SPA, `/admin/catalog` returns the SPA
  (fallback works), `/api/nope` returns JSON `{"error":"Not found"}` not HTML,
  `/health` returns `{"ok":true}`.
- The server binds `$PORT` when set, and 3000 when it is not.
- `docker build -t setlist .` succeeds natively on arm64, and the image contains the API
  entry, the SPA assets, and a runnable `dbmate`.

**Verify with:** (run as a script — statement separation is deliberate, see below)
```bash
set -e
pnpm install
pnpm -r build

PORT=4321 \
DATABASE_URL="postgres://u:p@localhost:5432/db?sslmode=disable" \
JWT_SECRET="0123456789012345678901234567890123" \
COOKIE_SECRET=x CRYPTO_KEY=y ADMIN_EMAIL=a@b.com WEB_ORIGIN=http://localhost:4321 \
node packages/api/dist/server.js &
SRV=$!
sleep 5

curl -sf localhost:4321/health                      | grep -q '"ok"'          && echo "HEALTH OK"
curl -sf localhost:4321/                            | grep -q '<div id="root"' && echo "SPA OK"
curl -s  localhost:4321/admin/catalog               | grep -q '<div id="root"' && echo "FALLBACK OK"
curl -s  localhost:4321/api/nope                    | grep -q '"error"'        && echo "API 404 OK"
kill $SRV

docker build -t setlist .
docker run --rm --entrypoint sh setlist -c \
  'test -f /app/packages/api/dist/server.js && \
   test -f /app/packages/web/dist/index.html && \
   dbmate --version && echo IMAGE_OK'
```
Three things in that script are not stylistic:
- The server launch is its **own statement**. Writing `pnpm -r build && … node … &`
  backgrounds the *entire* `&&` chain — `&` binds looser than `&&` — so the foreground
  `sleep` races a cold install+build and the check always fails.
- **No Postgres is required.** `packages/api/src/db.ts:73` constructs the `Pool` lazily
  and `/health` (`server.ts:30`) never queries. Do not start docker-compose for this.
- `docker run` needs `--entrypoint sh`. With `ENTRYPOINT` set, a trailing `sh -c '…'`
  is passed as *arguments to the entrypoint*, which ignores them — the container would
  run migrations against an empty `DATABASE_URL` and exit non-zero, making a working
  image look broken.

---

### Track 2 — Render blueprint, keep-alive, and the deploy runbook

**Owns files:** `render.yaml`, `DEPLOY.md`, `.env.example`,
`.github/workflows/keepalive.yml`

**Goal:** Someone with the repo and no memory of this conversation can get it live.

**Steps:**

1. Write `render.yaml` from this skeleton — `type` and `name` are required by Render's
   blueprint spec and their absence produces a file that passes YAML parsing and every
   grep check yet fails at deploy time:
   ```yaml
   services:
     - type: web
       name: setlist
       runtime: docker
       dockerfilePath: ./Dockerfile
       plan: free
       region: oregon
       healthCheckPath: /health
       # Do NOT raise this. Live queue updates broadcast through an in-process
       # EventEmitter (packages/api/src/sse.ts); a second instance breaks them
       # silently — requests just never appear on the admin queue.
       numInstances: 1
       envVars:
         - key: DATABASE_URL
           sync: false
         - key: JWT_SECRET
           sync: false
         # ... COOKIE_SECRET, CRYPTO_KEY, ADMIN_EMAIL, WEB_ORIGIN,
         #     SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI
   ```
   `sync: false` on every secret means it is entered in the dashboard and never
   committed. Do **not** add a `databases:` block — Postgres is on Neon (constraint 4).

2. Update `.env.example`: add `PORT` as documented-optional, plus a commented block
   showing the production shapes —
   `DATABASE_URL=postgres://...neon.tech/setlist?sslmode=require`,
   `WEB_ORIGIN=https://<service>.onrender.com`,
   `SPOTIFY_REDIRECT_URI=https://<service>.onrender.com/api/spotify/callback`.
   Keep every existing local-dev value exactly as-is.

3. Write `DEPLOY.md` with these six `##` headings, in order:

   **`## Neon`** — Create the project; copy the **direct (unpooled)** connection string,
   not the pooled one: this is one long-lived process with its own `pg` Pool, so
   PgBouncer buys nothing and its transaction-mode prepared-statement handling is an
   avoidable subtlety. Append `?sslmode=require`.

   **`## Secrets`** — `openssl rand -base64 32` for each. `JWT_SECRET` must be ≥32 chars
   (`env.ts` enforces it; the process exits at boot if short). `CRYPTO_KEY` must be
   32-byte base64 — it decrypts stored Spotify refresh tokens, so **changing it later
   invalidates every saved Spotify connection**.

   **`## Render`** — New Web Service → Docker → free plan → paste env vars → deploy.

   **`## First admin`** — There is no shell on Render's free tier, so run it locally
   against Neon. `packages/api/src/scripts/create-admin.ts` imports `../env.js`, which
   parses the **whole** schema at module load with no dotenv loader — so every required
   var must be present or the command dies on a zod error before touching the database.
   Dummy values are fine for everything except `DATABASE_URL`:
   ```bash
   DATABASE_URL="<neon url>" \
   JWT_SECRET="$(openssl rand -hex 32)" \
   COOKIE_SECRET=x CRYPTO_KEY=x \
   ADMIN_EMAIL=you@example.com \
   WEB_ORIGIN=https://<service>.onrender.com \
   pnpm create-admin
   ```
   It prompts for a password on stdin. Note that re-running it for an existing email
   **resets that admin's password** rather than erroring
   (`packages/api/src/scripts/create-admin.ts:36-41`).

   **`## Spotify`** — Add `https://<service>.onrender.com/api/spotify/callback` to the
   Spotify app's redirect URIs; it must match `SPOTIFY_REDIRECT_URI` byte for byte. Note
   that per `DECISIONS.md` the OAuth handshake has never been run end-to-end.

   **`## Running a gig`** — Free services spin down after 15 min idle and take ~1 min to
   wake. **Set up the external keep-alive pinger (step 4) as the primary mechanism and
   leave it running for the duration of the event.** Do not assume an open SSE
   connection prevents spin-down: Render documents spin-down against *inbound* traffic,
   and the 20s heartbeat in `sse.ts:42` is server→client only — this is unverified, and
   the failure mode is "band plays, requests stop appearing." Belt and braces: open the
   admin page ~5 minutes before doors. State the budget: 750 instance-hours/month per
   workspace against ~730 for always-on — it fits, with no room for a second free
   service. Sizing: Neon free is 0.5 GB storage and 100 CU-hours/month, both far beyond
   a song catalog and request history. `/health` does not touch the database, so
   keep-alive pings hold Render warm without consuming Neon compute hours.

4. Write `.github/workflows/keepalive.yml`: a 10-minute `schedule` cron plus
   `workflow_dispatch`, curling `${{ vars.KEEPALIVE_URL }}/health`. Guard the job with
   `if: vars.KEEPALIVE_URL != ''` so a fork or fresh clone does not cron against an empty
   URL. In a header comment, state both caveats honestly: GitHub's scheduled runners are
   best-effort and commonly 10–30 minutes late, and scheduled workflows are disabled
   automatically after 60 days without repo activity. Recommend an external pinger
   (UptimeRobot, cron-job.org) as the dependable option and this as the zero-signup
   fallback.

5. Do **not** append to `DECISIONS.md` (Track 1 owns it). Record any deviation in your
   commit message body instead.

**Acceptance:**
- Both YAML files parse.
- `render.yaml` declares exactly one service with `type: web`, a `name`, `plan: free`,
  and `numInstances: 1`, and contains no literal secret values.
- `DEPLOY.md` contains all six headings.
- `.env.example` still contains every key `env.ts` requires.

**Verify with:**
```bash
npx --yes js-yaml render.yaml > /dev/null && \
npx --yes js-yaml .github/workflows/keepalive.yml > /dev/null && echo "YAML OK"

grep -q 'type: web'        render.yaml && \
grep -q 'numInstances: 1'  render.yaml && \
grep -q 'plan: free'       render.yaml && \
! grep -Eq 'postgres://[^<$]*:[^<@$]*@' render.yaml && echo "BLUEPRINT OK"

for h in Neon Secrets Render "First admin" Spotify "Running a gig"; do
  grep -q "^## $h" DEPLOY.md || { echo "DEPLOY.md missing: $h"; exit 1; }
done && echo "RUNBOOK OK"

for k in DATABASE_URL JWT_SECRET COOKIE_SECRET CRYPTO_KEY ADMIN_EMAIL API_PORT WEB_ORIGIN; do
  grep -q "^$k=" .env.example || { echo ".env.example missing: $k"; exit 1; }
done && echo "ENV EXAMPLE OK"
```
(`npx --yes` is required — plain `npx` aborts with "missing packages and no YES option"
in a non-interactive shell, and macOS system python3 has no PyYAML, so do not reach for
`python3 -c "import yaml"` here.)

## Integration points

The two tracks share no files and no build inputs. The only coupling is **names**, and
Track 1 is the source of truth for all of them — Track 2 merely documents what Track 1
implements. If Track 1 deviates, `DEPLOY.md` and `render.yaml` are what go stale.

**Environment variable contract:**

| Var | Source | Notes |
|---|---|---|
| `PORT` | Render (10000) | Track 1 binds `PORT ?? API_PORT`; empty string must not crash boot |
| `API_PORT` | local only | default 3000, unchanged |
| `NODE_ENV` | Dockerfile `ENV`, runtime stage only | must be `production` — gates secure cookies |
| `DATABASE_URL` | Render dashboard | Neon **direct** URL + `?sslmode=require` |
| `JWT_SECRET` | Render dashboard | ≥32 chars, enforced by `env.ts` |
| `COOKIE_SECRET` | Render dashboard | |
| `CRYPTO_KEY` | Render dashboard | 32-byte base64; rotating it breaks saved Spotify tokens |
| `ADMIN_EMAIL` | Render dashboard | must be a valid email — `env.ts` uses `z.string().email()` |
| `WEB_ORIGIN` | Render dashboard | `https://<service>.onrender.com` — same origin as the API now |
| `WEB_DIST` | optional | overrides the static root; unset in normal operation |
| `SPOTIFY_*` | Render dashboard | optional; redirect URI must match Spotify's dashboard exactly |

## Out of scope

- Rearchitecting SSE, adding Redis/pub-sub, or enabling multi-instance (constraint 2).
- Adding `@fastify/cors` (constraint 5 — same-origin makes it unnecessary).
- A custom domain. `*.onrender.com` is enough; note in `DEPLOY.md` that a custom domain
  requires updating `WEB_ORIGIN` and the Spotify redirect URI together.
- Writing tests. `packages/api` declares `vitest` and `supertest` but the repo has
  **zero** test files. Do not add a suite here, and do not use `pnpm test` as a gate —
  the `Verify with` blocks are the gate.
- Adding a `packageManager` field to the root `package.json`. Nothing in this plan needs
  it, and no track owns that file. (Worth a later look: only the Dockerfile's
  `npm install -g pnpm@11.9.0` currently pins pnpm, so a future local install under a
  newer pnpm could regenerate the lockfile and break `--frozen-lockfile` in the image.)

## Verification

**Gate:** each track's `Verify with` block. There is no usable test suite.

**End-to-end check**, run once against the deployed URL:
1. `curl -sf https://<service>.onrender.com/health` → `{"ok":true}`
2. Load `/` in a browser; hard-refresh `/admin/catalog` and confirm it still renders
   (proves the SPA fallback).
3. Log in as the admin created via `pnpm create-admin`. Success proves the cookie + CSRF
   path works over HTTPS with `secure: true`.
4. **The one that matters:** open the admin queue on a laptop and the guest link on a
   phone. Submit a request from the phone and confirm it appears on the laptop *without
   a refresh*. This is the only check proving SSE survived containerization and Render's
   proxy. If it fails, check instance count first (constraint 1).

**Manual check:** in Render's dashboard confirm the service reports **1 instance**, and
confirm the deploy log shows dbmate applying `0001_initial_schema` and
`0002_add_song_genre` before the Fastify boot line.
