import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Patch 0477 -- the migration runner, moved here from db/migrate.ts so the
 * server can also apply pending migrations by itself when it starts
 * (index.ts). `npm run migrate` still works and does exactly the same
 * thing. Each file runs once, in its own transaction, recorded in
 * `_migrations`; a file that fails rolls back and stops the run.
 *
 * Resolves db/migrations from either src/ (tsx) or dist/ (compiled) --
 * both sit one level under server/.
 */
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

export async function runMigrations(databaseUrl: string, log: (message: string) => void = console.log): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const ran: string[] = [];
  try {
    // One runner at a time, if two copies of the server ever start together.
    await client.query("SELECT pg_advisory_lock(hashtext('guildbound_migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    const applied = new Set(
      (await client.query('SELECT filename FROM _migrations')).rows.map((r) => r.filename)
    );
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      log(`Applying ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        ran.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.end();
  }
  return ran;
}
