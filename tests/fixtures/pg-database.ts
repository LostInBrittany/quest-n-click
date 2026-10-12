// A Postgres database of a test's own (4.1.20 PR 2a): one database on the server `BRIDGE_PG_URL` names, created
// empty, dropped when the file's tests are done. Before it, every file of the set `reality-store-postgres` opened the
// same database: the leaderboard tests read the rows of the tests before them, and a worker of
// bridge-runs-durable claimed bridge-admission's queued runs (a claim without a tenant takes any tenant's) when the
// mutation run played the files side by side. A store a test opens on `BRIDGE_PG_URL` directly is refused by
// tests/bridge-postgres-isolation.test.ts.
import { randomBytes } from 'node:crypto';
import { afterAll } from 'vitest';
import type { PgModule } from '../../bridge/src/store-postgres';

/** The `pg` module the tests use (`BRIDGE_PG_MODULE` names another, for a local run without the repository's). */
const pgModule = async (): Promise<PgModule> =>
  ((await import(/* @vite-ignore */ process.env.BRIDGE_PG_MODULE ?? 'pg')) as { default: PgModule }).default;

const made: string[] = [];
afterAll(async () => {
  if (!made.length) return;
  const pg = await pgModule();
  const admin = new pg.Pool({ connectionString: process.env.BRIDGE_PG_URL! });
  try {
    // WITH (FORCE): a connection a test left open does not keep its database (Postgres 13 and later).
    for (const name of made.splice(0)) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

/** The URL of a new, empty database on the server `BRIDGE_PG_URL` names; dropped after the file's tests. */
export async function pgDatabase(prefix: string): Promise<string> {
  const base = process.env.BRIDGE_PG_URL;
  if (!base) throw new Error('pgDatabase: BRIDGE_PG_URL names no server');
  if (!/^[a-z_]+$/.test(prefix)) throw new Error(`pgDatabase: ${prefix} is not a database name prefix`);
  const name = `${prefix}_${randomBytes(4).toString('hex')}`;
  const pg = await pgModule();
  const admin = new pg.Pool({ connectionString: base });
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  made.push(name);
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}
