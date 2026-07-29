#!/bin/sh
set -e

[ -n "$DATABASE_URL" ] || { echo "DATABASE_URL is not set" >&2; exit 1; }

# dbmate and the app disagree about one Neon connection parameter, so the
# migration step gets its own sanitized copy of the URL.
#
# Neon's dashboard hands out connection strings containing
# `channel_binding=require`. node-postgres (which the app uses) ignores the
# parameter and connects fine, but dbmate is built on lib/pq, which forwards
# unknown query params to the server as runtime parameters — and Postgres
# rejects it outright:
#
#     pq: unrecognized configuration parameter "channel_binding" (42704)
#
# Worse, --wait hides that behind 60s of "Waiting for database..." before the
# container exits 1 and Render crash-loops, so it reads like a network fault.
# Strip it here (handles either param order, and a lone param) rather than
# relying on whoever pastes the URL to remember. DATABASE_URL itself is left
# untouched so the app keeps channel binding.
MIGRATE_URL=$(printf '%s' "$DATABASE_URL" | sed -E \
  -e 's/([?&])channel_binding=[^&]*&/\1/g' \
  -e 's/[?&]channel_binding=[^&]*$//g')

# --wait/--wait-timeout: Neon scale-to-zero means the first connect after an
# idle period can fail before the compute finishes resuming (~1s). Without
# --wait, set -e aborts here and Render crash-loops the deploy behind an
# opaque "connection refused".
# --no-dump-schema: dbmate's schema dump shells out to pg_dump, which is not
# present in node:22-bookworm-slim.
dbmate --wait --wait-timeout 60s --url "$MIGRATE_URL" \
  --migrations-dir /app/db/migrations --no-dump-schema up

# exec makes node PID 1 so it receives Render's SIGTERM on redeploy.
exec node /app/packages/api/dist/server.js
