#!/bin/sh
set -e

[ -n "$DATABASE_URL" ] || { echo "DATABASE_URL is not set" >&2; exit 1; }

# Migrations run on node-postgres, the same driver the app uses, rather than
# on dbmate.
#
# dbmate is built on lib/pq, which does not get along with Neon. It forwards
# unknown connection parameters to the server, so Neon's default
# `channel_binding=require` produced:
#
#     pq: unrecognized configuration parameter "channel_binding" (42704)
#
# and once that was worked around it failed again at boot with:
#
#     pq: invalid input syntax for type uuid: "{"public","schema_migrations"}"
#
# The app's own driver connects to the same database without complaint, so
# there is no reason to keep a second driver in the boot path with its own
# incompatibilities. The runner is deliberately dbmate-compatible — same
# schema_migrations table, same version scheme, same file format — so
# `pnpm migrate` still works locally.
#
# Neon's scale-to-zero means the first connect after an idle period can land
# while the compute is still resuming, so retry briefly instead of letting
# set -e turn a cold start into a crash-loop.
attempt=1
until node /app/packages/api/dist/scripts/migrate.js; do
  if [ "$attempt" -ge 5 ]; then
    echo "migrate: giving up after $attempt attempts" >&2
    exit 1
  fi
  echo "migrate: attempt $attempt failed, retrying in 5s (database may be resuming)" >&2
  attempt=$((attempt + 1))
  sleep 5
done

# exec makes node PID 1 so it receives Render's SIGTERM on redeploy.
exec node /app/packages/api/dist/server.js
