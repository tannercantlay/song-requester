# Decisions & Deviations

Log any point where the implementation deviates from `BUILD_PLAN.md` / `design.md`, with a one-line reason.

- **2026-07-03** — `setlist-poc/` (the vanilla-JS reference implementation) was never provided in this repo; only `BUILD_PLAN.md`, `design.md`, and `db/` came through. Phases are implemented directly from `design.md` §5-7 and `BUILD_PLAN.md` §3 instead of by porting POC behavior.
- **2026-07-03** — Node 20 LTS isn't installed locally (system has Node 25.8.2); proceeding with Node 25 since the codebase doesn't rely on anything LTS-specific. `engines.node` in root `package.json` is left at `>=20`.
- **2026-07-03** — `create-vite` scaffolds React 19 / Vite 8 / oxlint by default now; pinned `packages/web` back to React 18 + Vite 5 per the locked decision table, and deferred full ESLint+Prettier setup (not required by any Phase 0 "Done when" check) — revisit before Phase 4.
- **2026-07-03** — Local `docker-compose` Postgres has no TLS cert configured, so `dbmate`/`pg`'s default `sslmode=require` fails with "SSL is not enabled on the server". Added `?sslmode=disable` to `DATABASE_URL` in `.env`/`.env.example` for local dev only (DB is `localhost`-only, not network-exposed). A real deployment (RDS/managed Postgres, `design.md` §12) must use `sslmode=require` or drop the param — don't copy this into prod config.
