import pg from 'pg';
import { env } from './env.js';

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

// pg emits 'error' on the pool when an *idle* client's connection is reset
// by Postgres (network blip, managed-DB idle-connection reap) — with no
// listener, Node treats that as an uncaught exception and crashes the whole
// process, dropping every in-flight request (including unrelated ones, e.g.
// admin login) with a raw connection-reset error instead of a normal 500.
pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

// Runs `fn` inside a transaction, passing a dedicated client (needed for
// SELECT ... FOR UPDATE row locking — see plan §11 concurrency-safe reservations).
// Commits on success, rolls back and rethrows on any error.
export async function withTransaction(fn) {
  const client = await pool.connect();
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
