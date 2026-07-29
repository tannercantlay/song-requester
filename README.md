# SetList

A live song-request app for gigs. The host puts a QR code on the tables; guests
scan it, browse the band's actual catalog, and request songs. Requests stream to
the host's queue in real time, where they can be reordered, marked playing, or
dismissed.

Guests never see a text box they can type a song title into — they can only pick
from the catalog the host curated, so nothing lands in the queue that the band
can't actually play.

## How it works

**Guests** open `/e/<token>` (no login, no app install). They search by song or
artist, optionally filter by genre, and tap a song to request it. They can add
their name and a short dedication ("for the birthday girl"). Requesting a song
someone already asked for upvotes it instead of duplicating it, so the queue
surfaces what the room actually wants.

Each browser generates a random guest token on first visit and keeps it in
`localStorage`, which is what upvote-deduping and per-guest blocking key off.
There is no guest account.

**The host** logs in at `/login` and works from three pages:

| Page | What it does |
|---|---|
| `/admin` | The live queue: now playing, pending requests, reorder, status changes, pause, block, QR code |
| `/admin/catalog` | The song catalog: add/edit songs, import from Spotify or a spreadsheet |
| `/admin/team` | Additional host logins for co-hosts |

Requests move through `pending → playing → played`, or get `dismissed`. The host
can drag to reorder the queue, pause requests entirely between sets, rename the
event inline, and block an individual guest whose dedications have stopped being
funny. A chime plays on each new request (mutable, remembered in `localStorage`).

Live updates arrive over Server-Sent Events, so the queue moves without anyone
refreshing.

## Stack

pnpm workspace monorepo, TypeScript throughout, ESM.

- `packages/api` — Fastify 4, Kysely + node-postgres, argon2 password hashing, zod validation
- `packages/web` — React 18, Vite 5, Tailwind 3, TanStack Query, dnd-kit for drag-reorder
- `db/` — Postgres schema and `dbmate` migrations

## Local setup

**Prerequisites:** Node 20+, pnpm, Docker (for the local Postgres), and
[dbmate](https://github.com/amacneil/dbmate) (`brew install dbmate`) — it's a
standalone binary, not an npm dependency.

```bash
pnpm install
cp .env.example .env          # defaults work as-is for local dev
docker compose up -d db       # Postgres 16 on :5432
pnpm migrate                  # apply db/migrations
pnpm seed                     # optional: "Demo Party" event + a few songs
pnpm create-admin             # prompts for a password; uses ADMIN_EMAIL from .env
pnpm dev
```

That starts the API on **:3000** and the web app on **:5173**, with Vite
proxying `/api` to the API. Open http://localhost:5173.

If you ran `pnpm seed`, the guest view is at http://localhost:5173/e/demo and
the admin at http://localhost:5173/admin.

### A note on `sslmode`

`.env.example` sets `?sslmode=disable` because the local docker-compose Postgres
has no TLS certificate. That is local-only — production uses `sslmode=require`.
Don't copy the local value into a deployed config.

## Loading the catalog

Three ways, all from `/admin/catalog`:

**Manually** — add songs one at a time. Fine for a small set list.

**From Spotify** — connect a Spotify account and import a playlist. Requires
`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_REDIRECT_URI`. Imported
tracks get `genre: null`; the Spotify API only exposes genre at the artist
level, so genres stay editable afterward rather than being guessed.

**From a spreadsheet** — upload `.csv`, `.xlsx`, or `.xls` (10 MB max). This
exists because Amazon Music and most other services have no public playlist API.
Column headers are matched case-insensitively against these aliases:

| Field | Accepted headers |
|---|---|
| Title *(required)* | `title`, `song`, `song title`, `track`, `track title`, `name` |
| Artist *(required)* | `artist`, `artist name`, `performer` |
| Album | `album`, `album name` |
| Genre | `genre`, `category`, `genre/category`, `style` |

Rows missing a title or artist are reported back individually rather than
failing the whole upload, and rows matching an existing song by
case-insensitive `(title, artist)` are skipped rather than duplicated.

Genre is free text with an autocomplete list, not a fixed vocabulary — real
catalogs tag inconsistently and a personal set list doesn't need a taxonomy.
Whatever genres exist become the guest-facing filter.

## Running an event

1. Create an event from `/admin`. It gets a random public token.
2. Show the QR code (built into the admin page) or share the `/e/<token>` link.
3. Work the queue as requests come in.
4. Pause requests between sets if you want a breather.

Multiple people can host: `/admin/team` creates additional logins. There are no
roles — every admin shares the same events, catalog, and queue. You can't delete
your own account or the last remaining admin.

## Deployment

Deploys as a single Docker container on Render's free tier, with Postgres on
Neon. Fastify serves both the API and the built SPA from one origin. Total cost
$0/mo. Budget about 20 minutes, most of it waiting on the first Docker build.

**[DEPLOY.md](DEPLOY.md)** carries the same steps with the full reasoning behind
each one — read it if something goes wrong or you want to know *why* a setting
is what it is. What follows is the configuration itself.

### Before you start

`render.yaml` has to exist on the branch Render watches, which defaults to your
repo's default branch. If the deployment work is still sitting on a feature
branch, merge it first or point the Blueprint at that branch explicitly.

### 1. Configure Neon

1. Create a free project at [neon.tech](https://neon.tech). Pick a region near
   your Render region (`oregon` if you follow this doc as written).
2. Copy the **direct (unpooled)** connection string — *not* the pooled/PgBouncer
   one. This app is a single long-lived process with its own connection pool, so
   PgBouncer adds nothing and its transaction-mode prepared-statement handling is
   a subtlety you don't need.
3. Make sure it ends with `?sslmode=require`:
   ```
   postgres://<user>:<password>@<project>.neon.tech/setlist?sslmode=require
   ```
   Neon usually appends `&channel_binding=require` too. **Leave it** — the
   container strips it before running migrations, because `dbmate` uses a driver
   that forwards unknown parameters to Postgres, which rejects that one outright.
   The app's own driver ignores it.

You do **not** need to run migrations yourself — the container applies them on
every boot. In particular don't run `pnpm migrate` against Neon: the root script
omits `--no-dump-schema`, so it rewrites `db/schema.sql` from the remote database
and leaves an unexpected diff in your working tree.

Free tier: 0.5 GB storage, 100 CU-hours/month, 5 GB transfer. Scales to zero
after 5 minutes idle and resumes in about a second, with no pause and no expiry —
which is why Neon rather than Supabase (pauses after 7 days idle, ~30s wake) or
Render's own free Postgres (deleted 30 days after creation).

### 2. Generate secrets

Run `openssl rand -base64 32` three times:

| Variable | Notes |
|---|---|
| `JWT_SECRET` | Must be ≥32 characters — `env.ts` enforces it and the process exits at boot if it's short |
| `COOKIE_SECRET` | Any random string |
| `CRYPTO_KEY` | 32-byte base64. Encrypts stored Spotify tokens — **changing it later invalidates every saved Spotify connection** |

Keep them in a password manager. They go into the Render dashboard and are never
committed.

### 3. Configure Render

1. **New → Blueprint**, and connect the repo. It must be **Blueprint**, not
   **Web Service** — only a Blueprint instance reads `render.yaml`. A
   hand-created Web Service ignores the file entirely and you'd silently lose
   every setting it pins, including `numInstances: 1`.
2. Render reads `render.yaml` and creates the service: Docker runtime,
   `./Dockerfile`, free plan, region `oregon`, health check `/health`, one
   instance.
3. Fill in the environment variables it prompts for. Every one is declared
   `sync: false`, meaning Render asks for it in the dashboard and it never
   touches the repo:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon connection string from step 1 |
   | `JWT_SECRET` / `COOKIE_SECRET` / `CRYPTO_KEY` | From step 2 |
   | `ADMIN_EMAIL` | The email you'll log in as |
   | `WEB_ORIGIN` | `https://<service>.onrender.com` |
   | `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_REDIRECT_URI` | Optional — leave blank to start |

   **Expect a chicken-and-egg on `WEB_ORIGIN`:** it needs the Render URL, which
   doesn't exist until the service is created. Put a placeholder in, let Render
   create the service, note the real URL, then update the variable and redeploy.

   Leaving the Spotify variables blank is fine — they're optional in `env.ts`,
   and the spreadsheet import covers catalog loading. Skipping Spotify on the
   first pass also avoids the one part of the app that has never been tested
   end-to-end.
4. Deploy. Then confirm `https://<service>.onrender.com/health` returns
   `{"ok":true}`, and check the deploy log for `Applying: 0001_initial_schema`
   and `0002_add_song_genre`.

Free tier: 512 MB RAM / 0.1 CPU, 750 instance-hours/month per workspace, 100 GB
bandwidth, free TLS on `*.onrender.com`. No persistent disk and no shell access —
which is why the next step runs locally.

### 4. Create the first admin

No shell on the free tier, so create it from your machine against Neon:

```bash
DATABASE_URL="<neon url>" \
JWT_SECRET="$(openssl rand -hex 32)" \
COOKIE_SECRET=x CRYPTO_KEY=x \
ADMIN_EMAIL=you@example.com \
WEB_ORIGIN=https://<service>.onrender.com \
pnpm create-admin
```

The dummy values are load-bearing: `create-admin.ts` imports the env module,
which validates the *whole* schema at load time with no dotenv loader, so every
variable must be set even though only `DATABASE_URL` gets used. It prompts for a
password on stdin.

### 5. Set up a keep-alive pinger

Do this before your first real gig. Point [UptimeRobot](https://uptimerobot.com)
or [cron-job.org](https://cron-job.org) at
`https://<service>.onrender.com/health` every 5–10 minutes.

This matters more than it sounds. Free services spin down after 15 minutes idle
and take about a minute to wake, and whether an open SSE connection defers that
is **unverified** — Render documents spin-down against inbound traffic, and the
heartbeat in `sse.ts` is server-to-client only. The failure mode is quiet: the
band plays and requests just stop appearing. Belt and braces, open the admin page
yourself about five minutes before doors.

`.github/workflows/keepalive.yml` is a zero-signup fallback using GitHub Actions'
scheduler, but its cron is best-effort and commonly 10–30 minutes late — read the
caveats in its header before relying on it for an event that matters.

Keeping the service always on costs ~730 of the 750 monthly instance-hours, so it
fits but leaves no room for a second free service in the same workspace.
`/health` doesn't touch the database, so pings don't spend Neon compute hours.

### If you use Spotify

Add `https://<service>.onrender.com/api/spotify/callback` to your Spotify app's
Redirect URIs. It must match `SPOTIFY_REDIRECT_URI` byte for byte. Moving to a
custom domain later means updating `WEB_ORIGIN`, `SPOTIFY_REDIRECT_URI`, and the
URI registered with Spotify together.

### The one constraint not to break

The API must run as **exactly one instance**. Live queue updates broadcast
through an in-process `EventEmitter` (`packages/api/src/sse.ts`), so a second
instance breaks them *silently* — a guest's request simply never appears on the
host's queue, with nothing logged. This is why the app isn't on a serverless
platform and why `render.yaml` pins `numInstances: 1`. Free instances can't scale
anyway; it becomes yours to enforce the moment you upgrade.

### Verifying it actually works

`/health` returning 200 proves very little. The check that matters: open the
admin queue on a laptop and the guest link on a phone, submit a request, and
confirm it appears **without a refresh**. That's the only thing that proves the
live-update path survived containerization and Render's proxy.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | API and web in watch mode, in parallel |
| `pnpm build` | Build both packages |
| `pnpm migrate` | Apply migrations (`dbmate up`) |
| `pnpm migrate:down` | Roll back the last migration |
| `pnpm seed` | Load `db/seeds/dev_seed.sql` |
| `pnpm create-admin` | Create an admin, or reset an existing one's password |

`pnpm create-admin` **silently resets the password** if the email already has an
account, rather than erroring. Handy when you forget it; worth knowing before
you run it twice.

## Layout

```
packages/api/src/
  routes/      HTTP endpoints (public guest routes, admin routes, auth, Spotify)
  services/    business logic
  lib/         crypto, moderation, spreadsheet parsing
  sse.ts       in-process event bus for live queue updates
  env.ts       zod-validated environment
packages/web/src/
  routes/      GuestPage, LoginPage, AdminPage, CatalogPage, TeamPage
  components/  QueueCard, SongRow, QrCard, SortableQueueItem
  lib/         guest token, chime, SSE hook
db/
  migrations/  dbmate migrations
  seeds/       dev seed data
```

Design notes and the reasoning behind specific choices live in `design.md`,
`BUILD_PLAN.md`, and `DECISIONS.md` — the last of which logs every point where
the implementation deviated from the plan, and why.

## Known gaps

- **There are no tests.** `packages/api` declares `vitest` and `supertest` but
  contains no test files. `pnpm test` is not a meaningful gate.
- **Spotify OAuth has never run end-to-end.** No live credentials were available
  during development. The routes are implemented and unit-verifiable, but expect
  to debug the handshake on first real use.
- **Moderation is a hardcoded wordlist** (`packages/api/src/lib/moderation.ts`)
  applied to guest names and dedications. Deliberately minimal; revisit if abuse
  actually shows up.
- Guest requests are rate-limited to 1 per 3 seconds per (IP, guest token).
