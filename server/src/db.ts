import pg from 'pg';

let pool: pg.Pool | null = null;

/**
 * Lazily creates one shared connection pool for the whole process --
 * created on first real use, not at import time, so importing this
 * module never requires DATABASE_URL to be set (matters for routes/tests
 * that don't touch the database at all, and for keeping `server/`'s own
 * "no database client wired in" skeleton-stage behaviour intact until
 * something actually needs one).
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set -- see server/.env.example.');
    }
    pool = new pg.Pool({ connectionString: databaseUrl });
  }
  return pool;
}

/**
 * Runs `fn` with a single checked-out client already inside a
 * transaction -- BEGIN before, COMMIT on success, ROLLBACK on any thrown
 * error, the client always released back to the pool either way. This is
 * what the buyout route's row-locked check/mark-sold/mailbox-insert
 * sequence runs inside (listings.ts) -- the one genuine concurrency risk
 * the whole Auction House design flagged from the start: two buyout
 * clicks on the same listing landing at the same moment.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
