/**
 * Tiny migration runner -- no ORM, deliberately. This project's own
 * conventions favour hand-rolled, inspectable machinery over frameworks
 * (the DevTool's own schema-driven editor, server.mjs's hand-rolled
 * routing) -- a migration runner is a much smaller surface than an ORM,
 * so it gets the same treatment rather than pulling in a heavier
 * dependency for something this simple.
 *
 * Run with: npm run migrate (see package.json). Applies every .sql file
 * in db/migrations/, in filename order, that isn't already recorded in
 * the `_migrations` table -- safe to run repeatedly, every time the
 * server starts if you want, since already-applied files are skipped.
 */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set -- see server/.env.example.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await client.query('SELECT filename FROM _migrations')).rows.map((r) => r.filename)
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ranAny = false;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`Applying ${file}...`);
      // Each migration runs in its own transaction -- a failure partway
      // through one file rolls back cleanly rather than leaving the
      // schema half-applied.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        ranAny = true;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log(ranAny ? 'Migrations applied.' : 'Already up to date, nothing to do.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
