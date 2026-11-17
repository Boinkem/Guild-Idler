import 'dotenv/config';
import { runMigrations } from '../src/migrations.js';

/**
 * Tiny, dependency-free migration runner -- no ORM, no migration
 * framework, just numbered .sql files applied once each in filename
 * order and recorded in a `_migrations` table so re-running is a no-op.
 *
 * Usage (from server/): npm run migrate
 *
 * Since patch 0477 the server also runs this by itself on start (see
 * src/index.ts), so this command is only needed to apply migrations
 * without starting the server. The runner itself lives in
 * src/migrations.ts.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set -- see server/.env.example.');
    process.exit(1);
  }
  const ran = await runMigrations(databaseUrl);
  console.log(ran.length > 0 ? 'Migrations applied.' : 'Already up to date, nothing to do.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
