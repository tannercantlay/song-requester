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

See **[DEPLOY.md](DEPLOY.md)** for the full runbook. Short version: it deploys
as a single Docker container on Render's free tier with Postgres on Neon, and
Fastify serves both the API and the built SPA from one origin.

One constraint worth knowing before you change anything about the topology: the
API must run as **exactly one instance**. Live queue updates broadcast through
an in-process `EventEmitter` (`packages/api/src/sse.ts`), so a second instance
breaks them *silently* — a guest's request simply never appears on the host's
queue, with nothing logged. This is why the app isn't on a serverless platform
and why `render.yaml` pins `numInstances: 1`.

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
