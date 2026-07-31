import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

/**
 * Applies pending migrations using node-postgres.
 *
 * This exists because dbmate could not talk to Neon. Its Go driver (lib/pq)
 * forwards unknown connection parameters to the server, which already broke
 * once on Neon's `channel_binding=require`, and then failed again at boot
 * with `pq: invalid input syntax for type uuid`. The app's own driver
 * connects to the same database without complaint, so migrations now run on
 * the driver we already trust rather than a second one with its own quirks.
 *
 * Deliberately compatible with dbmate in both directions:
 *   - same table:   schema_migrations (version varchar primary key)
 *   - same version: the filename up to the first underscore ("0001")
 *   - same format:  the `-- migrate:up` section, ignoring `-- migrate:down`
 *
 * so `pnpm migrate` locally and this in the container agree about what has
 * already been applied.
 */

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  ? path.resolve(process.env.MIGRATIONS_DIR)
  : fileURLToPath(new URL("../../../../db/migrations/", import.meta.url));

// Any 64-bit constant works; it only has to be the same in every instance.
const ADVISORY_LOCK_ID = 4_812_257_390_112_233;

interface Migration {
  version: string;
  filename: string;
  up: string;
}

function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const body = readFileSync(path.join(dir, filename), "utf8");
      const start = body.indexOf("-- migrate:up");
      if (start === -1) {
        throw new Error(`${filename}: no "-- migrate:up" marker`);
      }
      const down = body.indexOf("-- migrate:down");
      const up = body
        .slice(start + "-- migrate:up".length, down === -1 ? undefined : down)
        .trim();
      if (!up) throw new Error(`${filename}: empty "-- migrate:up" section`);
      return { version: filename.split("_")[0], filename, up };
    });
}

/** Host and database only — never the credentials. */
function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const migrations = loadMigrations(MIGRATIONS_DIR);
  // Logged before connecting: when this failed on Render the log showed only
  // the driver error, with no way to tell which database it had reached.
  console.log(`migrate: ${migrations.length} migration(s) in ${MIGRATIONS_DIR}`);
  console.log(`migrate: target ${describeTarget(url)}`);

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(
      "create table if not exists public.schema_migrations (version varchar primary key)",
    );
    // Serialises concurrent boots. The service is pinned to one instance, but
    // a redeploy can briefly overlap the old container with the new one.
    await client.query("select pg_advisory_lock($1)", [ADVISORY_LOCK_ID]);

    try {
      const { rows } = await client.query<{ version: string }>(
        "select version from public.schema_migrations",
      );
      const applied = new Set(rows.map((r) => r.version));
      const pending = migrations.filter((m) => !applied.has(m.version));

      if (pending.length === 0) {
        console.log("migrate: nothing to apply");
        return;
      }

      for (const m of pending) {
        const started = Date.now();
        // The whole section goes in one query rather than being split on
        // semicolons — splitting breaks on dollar-quoted bodies and on
        // semicolons inside string literals.
        await client.query("begin");
        try {
          await client.query(m.up);
          await client.query("insert into public.schema_migrations (version) values ($1)", [
            m.version,
          ]);
          await client.query("commit");
        } catch (err) {
          await client.query("rollback");
          throw new Error(`${m.filename} failed: ${(err as Error).message}`);
        }
        console.log(`migrate: applied ${m.filename} in ${Date.now() - started}ms`);
      }
    } finally {
      await client.query("select pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`migrate: ${(err as Error).message}`);
  process.exit(1);
});
