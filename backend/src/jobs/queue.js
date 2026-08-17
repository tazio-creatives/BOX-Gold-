import PgBoss from 'pg-boss';
import { env } from '../config/env.js';

// Postgres-backed job queue (plan §2: "no Redis needed") — runs in the same
// process as the API server for now; nothing in the design prevents
// splitting it into a separate worker process later if load requires it.
export const boss = new PgBoss({ connectionString: env.databaseUrl });

export async function startJobQueue() {
  boss.on('error', (err) => console.error('[pg-boss]', err));
  await boss.start();
}

export async function stopJobQueue() {
  await boss.stop({ graceful: true });
}
