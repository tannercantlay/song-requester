# Deploying setlist

One Docker container on Render's free tier, serving both `/api/*` and the
built React SPA from a single origin, with Postgres on Neon. This doc
assumes no prior context — follow it top to bottom.

## Neon

1. Create a free Neon project (any region close to your Render region —
   `oregon` if you're following this doc as written).
2. In the Neon dashboard, copy the **direct (unpooled)** connection string,
   not the pooled/PgBouncer one. This app is a single long-lived process
   with its own `pg` `Pool`, so PgBouncer buys nothing here, and its
   transaction-mode prepared-statement handling is an avoidable subtlety
   you don't need to deal with.
3. Append `?sslmode=require` to the connection string if it isn't already
   there. The result should look like:
   ```
   postgres://<user>:<password>@<project>.neon.tech/setlist?sslmode=require
   ```
   Neon's dashboard usually appends `&channel_binding=require` as well. You
   can leave it — `docker-entrypoint.sh` strips it before running migrations
   — but it is worth knowing why. The app's driver (node-postgres) ignores
   the parameter, while `dbmate` is built on `lib/pq`, which forwards unknown
   query params to the server, and Postgres rejects it:
   `pq: unrecognized configuration parameter "channel_binding"`. Before the
   entrypoint sanitized it, that surfaced as 60 seconds of "Waiting for
   database..." followed by a crash-loop that looked like a network fault.

You do **not** need to run migrations yourself. `docker-entrypoint.sh`
applies them on every boot, before the server starts — see the deploy log for
`0001_initial_schema` and `0002_add_song_genre`. In particular, avoid
`pnpm migrate`: the root script omits `--no-dump-schema`, so it rewrites
`db/schema.sql` from the remote database and leaves an unexpected diff in
your working tree.

Neon's free tier gives 0.5 GB storage, 100 CU-hours/month (~400h at 0.25
CU), 5 GB transfer, and 10 branches. It scales to zero after 5 minutes idle
and resumes in ~1s with no pause and no expiry — unlike Supabase (pauses
after 7 days idle, ~30s wake) or Render's own free Postgres (deleted 30
days after creation). This is why Neon, not either of those, hosts the
database.

## Secrets

Generate each of these with:

```bash
openssl rand -base64 32
```

- `JWT_SECRET` — must be at least 32 characters; `packages/api/src/env.ts`
  enforces this with zod and the process exits at boot if it's too short.
- `COOKIE_SECRET` — any random string.
- `CRYPTO_KEY` — must be a 32-byte base64 value (the `openssl` command
  above produces one). It decrypts stored Spotify refresh tokens.
  **Changing it later invalidates every saved Spotify connection** — hosts
  will have to reconnect Spotify.

Keep these somewhere safe (a password manager). You'll paste them into the
Render dashboard in the next step and they are never committed to the repo.

## Render

1. In the Render dashboard: **New → Blueprint**, and connect this repo.
   It must be **Blueprint**, not **Web Service** — `render.yaml` is only
   read by a Blueprint instance. A service created via New → Web Service
   ignores the file entirely, and you would silently lose every setting it
   pins, including `numInstances: 1`.
2. Render reads `render.yaml` and creates the service: runtime Docker,
   `./Dockerfile`, `plan: free`, region `oregon`, health check `/health`,
   `numInstances: 1`.

   If you would rather configure it by hand via New → Web Service, set all
   of these yourself: **Language/Runtime** Docker, **Dockerfile Path**
   `./Dockerfile`, **Instance Type** Free, **Health Check Path** `/health`,
   and add every environment variable listed in `render.yaml` manually.
   Free instances cannot scale beyond one, so the single-instance
   requirement holds either way — but on a paid plan it would be yours to
   enforce.
3. Fill in the environment variables Render prompts for (each one is
   listed in `render.yaml` with `sync: false`, meaning Render asks for it
   in the dashboard and it's never stored in the repo):
   - `DATABASE_URL` — the Neon connection string from the Neon section.
   - `JWT_SECRET`, `COOKIE_SECRET`, `CRYPTO_KEY` — from the Secrets
     section.
   - `ADMIN_EMAIL` — the email you'll log in as (see First admin below).
   - `WEB_ORIGIN` — `https://<service>.onrender.com` (your Render URL;
     Render shows you this once the service is created — you may need to
     create the service first, note the URL, then come back and fill this
     in).
   - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`
     — see the Spotify section.
4. Deploy. The first build runs the Dockerfile, which builds both
   `packages/api` and `packages/web`; the API serves the built SPA
   alongside `/api/*` on the same origin.
5. Confirm `https://<service>.onrender.com/health` returns `{"ok":true}`.

Render's free plan gives 512 MB RAM / 0.1 CPU, 750 instance-hours/month
per workspace, 100 GB bandwidth, and free TLS on the `*.onrender.com`
subdomain. It spins down after 15 minutes idle and takes about a minute to
wake back up, and there is no persistent disk and no shell access on the
free tier — that's why the admin-creation step below runs locally instead
of on the box.

## First admin

There is no shell on Render's free tier, so create the first admin locally
against Neon instead. `packages/api/src/scripts/create-admin.ts` imports
`../env.js`, which parses the **whole** zod env schema at module load with
no dotenv loader — so every required env var must be present in the shell
or the command dies on a zod validation error before it ever touches the
database. Dummy values are fine for everything except `DATABASE_URL`:

```bash
DATABASE_URL="<neon url>" \
JWT_SECRET="$(openssl rand -hex 32)" \
COOKIE_SECRET=x CRYPTO_KEY=x \
ADMIN_EMAIL=you@example.com \
WEB_ORIGIN=https://<service>.onrender.com \
pnpm create-admin
```

It will prompt for a password on stdin. Note that re-running this command
for an email that already has an admin account **resets that admin's
password** rather than erroring
(`packages/api/src/scripts/create-admin.ts:36-41`) — useful if you forget
the password, but be aware it's silent about it.

## Spotify

In your Spotify Developer app's settings, add:

```
https://<service>.onrender.com/api/spotify/callback
```

to the app's Redirect URIs. It must match the `SPOTIFY_REDIRECT_URI`
environment variable byte for byte, including the scheme and trailing
path.

Per `DECISIONS.md`, the OAuth handshake has never been run end-to-end
during development — no live Spotify credentials were available. Expect to
debug it on first real use (from `/admin/catalog` → Connect Spotify).

## Running a gig

Free services spin down after 15 minutes idle and take about a minute to
wake back up. **Set up the external keep-alive pinger below as the
primary mechanism, and leave it running for the duration of the event** so
the box is already warm when guests start scanning the QR code.

Do not rely on an open SSE connection to keep the service awake — Render
documents spin-down against *inbound* traffic, and the 20s heartbeat in
`packages/api/src/sse.ts` is server-to-client only. Whether an idle-but-open
SSE connection counts as "inbound traffic" to Render's spin-down logic is
unverified; the failure mode if it doesn't is quiet — the band plays and
requests from guests just stop appearing on the queue. Belt and braces:
also open the admin queue page yourself about 5 minutes before doors, on
top of the automated pinger.

For an external keep-alive pinger, use a free service like
[UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org)
pinging `https://<service>.onrender.com/health` every 5–10 minutes — this
is the dependable option. `.github/workflows/keepalive.yml` in this repo
is a zero-signup fallback using GitHub Actions' scheduler; see the caveats
in its header comment before relying on it alone for an event that
matters.

Budget notes:

- Render free gives 750 instance-hours/month per workspace. Keeping this
  service always on is ~730 instance-hours/month — it fits, but leaves no
  room for a second free service in the same workspace.
- `/health` does not touch the database, so keep-alive pings hold Render
  warm without spending Neon's 100 CU-hours/month budget.

### Custom domain

If you later move off `*.onrender.com` to a custom domain, update
`WEB_ORIGIN` **and** `SPOTIFY_REDIRECT_URI` (and the redirect URI
registered in the Spotify app) together — they must stay in sync or
cookies/CORS and the OAuth callback will break.
