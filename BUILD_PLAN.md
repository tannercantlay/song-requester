# SetList — Build Plan for Claude Code (Sonnet)

This is an executable plan to build **SetList**, a QR-based live song-request app,
and run it **locally**. Hand this file to Claude Code (Sonnet) alongside
`design.md` and the `db/` folder. Build in the phases below, in order; each phase
ends in something you can run and click.

- **Full spec:** `design.md` (data model, endpoints, security, real-time).
- **Schema:** `db/migrations/0001_initial_schema.sql` (source of truth — don't redefine tables elsewhere).
- **Dev seed:** `db/seeds/dev_seed.sql`.
- **Reference implementation:** the `setlist-poc/` (vanilla-JS proof of concept) already demonstrates every endpoint and the SSE flow. Port its behavior to the real stack below — don't invent new contracts.

> Golden rule for the agent: **keep the API contract identical to `design.md` §6.** Same paths, same status codes (`409` played, `423` paused, `403` blocked), same SSE event names (`request.created`, `request.updated`, `queue.reordered`, `event.updated`).

---

## 0. Locked technical decisions (do not re-litigate)

| Area | Decision |
|---|---|
| Monorepo | **pnpm workspaces**: `packages/api`, `packages/web`, shared `db/` at root |
| Language | **TypeScript** everywhere, Node 20 LTS, ESM |
| Backend | **Fastify 4** |
| DB access | **Kysely** (type-safe SQL) over `pg` — no heavy ORM; matches the hand-written migrations |
| Migrations | **dbmate** (SQL files already provided) |
| Validation | **Zod** on every request body/params |
| Auth | `@fastify/jwt` + `@fastify/cookie` (httpOnly), **Argon2** password hash |
| Rate limit | `@fastify/rate-limit` on the public request endpoint |
| Real-time | **Native SSE** (raw response), one in-process `EventEmitter` per event |
| Frontend | **React 18 + Vite + TypeScript + Tailwind** |
| Data/fetch | **TanStack Query**; **React Router** for routes |
| Reorder UI | **@dnd-kit/core** (drag) + arrow buttons as fallback |
| QR | **qrcode.react** |
| Spotify | Authorization Code flow; raw `fetch` or `spotify-web-api-node` |
| Tests | **Vitest** + Supertest (API), **Playwright** (one e2e happy path) |
| Lint/format | ESLint + Prettier |
| Local infra | **Docker Compose**: Postgres always; api/web run via `pnpm dev` (hot reload) or containers |

If a library is unavailable or a version conflicts, pick the nearest stable equivalent and note it in `DECISIONS.md` — don't stall.

---

## 1. Target repo structure

```
setlist/
  pnpm-workspace.yaml
  package.json                 # root scripts (dev, migrate, seed, test)
  docker-compose.yml           # postgres (+ optional api/web)
  .env.example
  DECISIONS.md                 # agent logs any deviations here
  db/
    migrations/0001_initial_schema.sql
    seeds/dev_seed.sql
  packages/
    api/
      package.json
      tsconfig.json
      src/
        server.ts              # Fastify bootstrap, plugin registration
        db.ts                  # Kysely instance + generated types
        env.ts                 # Zod-validated env
        sse.ts                 # per-event EventEmitter registry + broadcast()
        auth/                  # jwt plugin, login/logout, requireAdmin hook
        routes/
          public.ts            # /api/e/:token/*
          events.ts            # admin event CRUD + pause + reorder + block
          requests.ts          # admin PATCH /api/requests/:id
          spotify.ts           # oauth + import
        services/              # request/upvote logic, queue query, spotify client
        scripts/create-admin.ts
      test/
    web/
      package.json
      index.html
      vite.config.ts
      tailwind.config.js
      src/
        main.tsx
        routes/
          GuestPage.tsx        # /e/:token
          AdminPage.tsx        # /admin
        api/                   # typed fetch hooks (TanStack Query)
        components/            # SongRow, QueueCard, QrCard, etc.
        lib/                   # guest token, sse hook, sound chime
```

---

## 2. Prerequisites (local)

- Node 20 + `corepack enable` (for pnpm), or `npm i -g pnpm`
- Docker Desktop (for Postgres)
- dbmate: `brew install dbmate` (or run migrations via the npm script wrapper)

`.env.example` → copy to `.env`:

```
DATABASE_URL=postgres://setlist:setlist@localhost:5432/setlist
JWT_SECRET=change-me-32-chars-min
COOKIE_SECRET=change-me-too
CRYPTO_KEY=32-byte-base64-for-spotify-token-encryption
ADMIN_EMAIL=you@example.com
API_PORT=3000
WEB_ORIGIN=http://localhost:5173
# Spotify (Phase 3)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/spotify/callback
```

Root `package.json` scripts (target):

```
"dev": "pnpm -r --parallel dev",
"migrate": "dbmate up",
"migrate:down": "dbmate down",
"seed": "psql \"$DATABASE_URL\" -f db/seeds/dev_seed.sql",
"create-admin": "pnpm --filter api create-admin",
"test": "pnpm -r test"
```

---

## 3. API contract (compact — full detail in `design.md` §6)

**Public (no auth, scoped by `:token`)**
- `GET /api/e/:token` → `{ id, name, requestsPaused }`; `410` if not active
- `GET /api/e/:token/songs?search=` → `{ requestsPaused, songs:[{id,title,artist,status:'none'|'pending'|'played',voteCount}] }`
- `POST /api/e/:token/requests` `{ songId, requesterToken, name?, note? }` → create or upvote. `409` played · `423` paused · `403` blocked · `404` bad song
- `GET /api/e/:token/now-playing` → current playing (optional)

**Admin (JWT cookie)**
- `POST /api/auth/login` `{ email, password }` → sets cookie · `POST /api/auth/logout` · `GET /api/me`
- `GET /api/events` (active) · `POST /api/events` `{name}` · `PATCH /api/events/:id` `{status?, requestsPaused?}`
- `GET /api/events/:id/requests` → queue (playing pinned, then `queue_position`, then votes/recency), each with `notes[]` and `tokens[]`
- `PATCH /api/requests/:id` `{status:'playing'|'played'|'dismissed'}`
- `POST /api/events/:id/reorder` `{ order:[requestId,...] }`
- `POST /api/events/:id/block` `{ tokens:[...] }`
- `GET /api/events/:id/stream` → **SSE**
- Spotify: `GET /api/spotify/connect` → `/callback`, `GET /api/spotify/playlists`, `POST /api/spotify/import`
- Catalog: `GET/POST/PATCH/DELETE /api/songs`

**Error shape (everywhere):** `{ "error": "human message" }` with the right HTTP status.

**SSE events:** `request.created`, `request.updated`, `queue.reordered`, `event.updated` (payloads in `design.md` §7).

---

## 4. Phases

Each phase: build → run → verify against "Done when". Commit at each ✅.

### Phase 0 — Scaffold & database (foundation)
**Goal:** repo runs, Postgres up, migrations applied, `/health` returns ok.
- [ ] Init pnpm monorepo + workspaces; add root scripts.
- [ ] `docker-compose.yml` with `postgres:16-alpine` (user/pass/db `setlist`), healthcheck, named volume.
- [ ] Wire dbmate to `db/migrations`; `pnpm migrate` applies `0001`.
- [ ] `packages/api`: Fastify server, Zod-validated `env.ts`, Kysely `db.ts` (generate/hand-write types matching the schema), `GET /health`.
- [ ] `packages/web`: Vite + React + Tailwind hello page.

**Done when:** `docker compose up -d db && pnpm migrate && pnpm seed` succeeds, `pnpm dev` serves the API on :3000 and web on :5173, and `curl localhost:3000/health` → `{"ok":true}`.

### Phase 1 — Core request loop (the demo)
**Goal:** guest requests a song; it appears live in the admin queue; admin marks it played.
- [ ] Public routes: `GET /api/e/:token`, `GET /api/e/:token/songs`, `POST /api/e/:token/requests` (create-or-upvote with the exact dedupe logic from the POC / `design.md` §5).
- [ ] `sse.ts`: per-event emitter + `broadcast()`; `GET /api/events/:id/stream`.
- [ ] Admin queue: `GET /api/events/:id/requests` (ordering rule), `PATCH /api/requests/:id` (playing/played/dismissed; played stamps `played_at`, clears `queue_position`).
- [ ] Web `GuestPage`: song list, search, request button, "Requested ✓", "Already played" badge.
- [ ] Web `AdminPage`: queue list, Now Playing / Played / Dismiss, live updates via an `useSSE` hook.
- [ ] Temporary dev auth: allow admin routes without login **behind an env flag** so Phase 1 is testable before Phase 3 wires real auth.

**Done when:** open `/e/demo` in one tab and `/admin` in another → request a song → it appears in the admin queue within ~1s → mark Played → guest list shows "Already played".

### Phase 2 — Host controls & delight
**Goal:** the features that make it usable at a real event.
- [ ] Pause/resume: `PATCH /api/events/:id {requestsPaused}`; guest banner + `423`.
- [ ] Manual reorder: `POST /api/events/:id/reorder`; admin drag (@dnd-kit) + ↑/↓ fallback; emits `queue.reordered`.
- [ ] Block guest: `POST /api/events/:id/block`; `403` on future requests; queue cards expose a Block action.
- [ ] Names/dedications: optional `name`/`note` on request; length-capped + profanity filter server-side; shown on admin cards.
- [ ] New-request chime (Web Audio) + mute toggle; optional browser Notification.
- [ ] Printable QR card: `qrcode.react` + print stylesheet.

**Done when:** each control works end-to-end and the guest UI reflects paused/played/blocked states correctly.

### Phase 3 — Real auth & Spotify import
**Goal:** production auth and a real catalog.
- [ ] `admin` login: Argon2 verify, `@fastify/jwt` in httpOnly cookie, CSRF token on mutations, `requireAdmin` hook; remove the Phase 1 dev-auth flag.
- [ ] `create-admin` script (hashes password, inserts admin row).
- [ ] `@fastify/rate-limit` on the public request endpoint (per IP + token).
- [ ] Spotify OAuth connect/callback; encrypt refresh token (AES-GCM, `CRYPTO_KEY`).
- [ ] `GET /api/spotify/playlists`, `POST /api/spotify/import` (upsert on `spotify_uri`, store album art + duration).
- [ ] Catalog management UI: search, add/edit/hide, Connect Spotify + import picker.

**Done when:** you log in with real credentials, connect Spotify, import a playlist, and those songs show on the guest page.

### Phase 4 — Tests & (later) deploy
- [ ] Vitest + Supertest: unit-test the create-or-upvote logic and the queue ordering; cover `409/423/403`.
- [ ] One Playwright e2e: guest request → admin sees it → mark played → guest badge.
- [ ] Deployment is out of scope for local testing — when ready, follow `design.md` §12 (Caddy + two containers on Lightsail). Keep it here as a stub.

**Done when:** `pnpm test` is green.

---

## 5. Running & testing locally (the target loop)

```bash
# one-time
cp .env.example .env            # fill secrets
corepack enable && pnpm install
docker compose up -d db
pnpm migrate && pnpm seed

# dev (hot reload)
pnpm dev                        # api :3000, web :5173

# open
#   Admin:  http://localhost:5173/admin
#   Guest:  http://localhost:5173/e/demo   (or your LAN IP for a real phone)
```

Notes for the agent:
- In dev, Vite proxies `/api` → `http://localhost:3000` (set this in `vite.config.ts`), so the frontend and API share an origin and cookies/SSE "just work".
- To test from a real phone, bind Vite to `0.0.0.0` and use the laptop's LAN IP; set `WEB_ORIGIN`/CORS accordingly.
- Reset DB: `docker compose down -v && docker compose up -d db && pnpm migrate && pnpm seed`.

---

## 6. Conventions the agent must follow

- Validate every input with Zod; reject with the `{error}` shape and correct status.
- All timestamps `timestamptz`; never trust client time.
- Never expose `requester_token` publicly except in the admin queue payload (needed for Block).
- Keep SSE payloads minimal; the guest never receives admin queue internals.
- Enforce `name ≤ 24`, `note ≤ 80`, strip HTML, run a profanity filter before insert.
- One request row per `(event_id, song_id)`; upvotes go through `request_vote` with the unique constraint doing the dedupe.
- Log deviations from this plan in `DECISIONS.md`.

---

## 7. Copy-paste kickoff prompts for Claude Code

Paste one per phase (attach `design.md` + `db/` to the session first).

**Phase 0**
> Read `BUILD_PLAN.md`, `design.md`, and `db/migrations/0001_initial_schema.sql`. Execute **Phase 0** only. Set up the pnpm monorepo (`packages/api` Fastify + TypeScript, `packages/web` Vite/React/Tailwind), `docker-compose.yml` with Postgres, wire dbmate to `db/migrations`, add the root scripts, and add `GET /health`. Then run `docker compose up -d db`, `pnpm migrate`, `pnpm seed`, `pnpm dev` and confirm the "Done when" checks. Stop at the phase boundary and summarize what you built.

**Phase 1**
> Execute **Phase 1** from `BUILD_PLAN.md`. Implement the public request routes, the SSE stream, the admin queue + status endpoint, and the minimal Guest and Admin pages, keeping the exact API contract in §3 and the dedupe logic in `design.md` §5. Use the `setlist-poc/` as the behavioral reference. Add the env-flagged dev auth so I can test admin routes now. Verify the "Done when" flow with two browser tabs, then stop.

**Phase 2** → *"Execute Phase 2 …"* (pause/resume, reorder w/ @dnd-kit, block, names, chime, QR card).
**Phase 3** → *"Execute Phase 3 …"* (Argon2 + JWT auth, create-admin script, rate limit, Spotify OAuth + import, catalog UI).
**Phase 4** → *"Execute Phase 4 …"* (Vitest + Supertest unit tests, one Playwright e2e).

Work phase by phase, commit at each ✅, and run the verification before moving on.

---

## 8. Definition of done (MVP, local)

- [ ] `pnpm dev` runs api + web; Postgres via compose; migrations + seed applied.
- [ ] Guest can browse/search, request, upvote, add optional name/dedication.
- [ ] Requests stream to the admin queue live with a chime.
- [ ] Admin can Now Playing / Played / Dismiss / Block, pause-resume, and reorder.
- [ ] Guest sees played + paused states correctly.
- [ ] Real admin login; Spotify import populates the catalog.
- [ ] `pnpm test` green.
