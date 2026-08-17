import pg from 'pg';
import { env } from './env.js';

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

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
