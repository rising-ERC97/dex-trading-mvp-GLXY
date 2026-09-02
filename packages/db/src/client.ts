/**
 * Database client factory. Default: PGlite (embedded Postgres). When
 * `databaseUrl` / DATABASE_URL is set, connect to real Postgres via `pg`.
 *
 * The public `Db` type is the PGlite drizzle surface; the node-postgres
 * handle is cast to the same shape (query API is compatible for our schema).
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { runMigrations } from './migrations.js';
import * as schema from './schema.js';

export type Db = PgliteDatabase<typeof schema>;

/** A drizzle transaction over our schema (also accepted everywhere a Db is). */
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Anything that can execute drizzle queries (root db or transaction). */
export type DbExecutor = Db | DbTx;

export interface DbHandle {
  db: Db;
  /** Present for embedded PGlite; absent when using DATABASE_URL / Postgres. */
  pglite?: PGlite;
  close: () => Promise<void>;
}

/** Handle returned by the default (no DATABASE_URL) path — pglite is always set. */
export interface PgliteDbHandle extends DbHandle {
  pglite: PGlite;
}

export interface CreateDbOptions {
  /** PGlite filesystem dir (undefined → memory://). Ignored when databaseUrl is set. */
  dataDir?: string;
  /** Postgres connection string. When set, uses `pg` instead of PGlite. */
  databaseUrl?: string;
}

export async function createDb(dataDir?: string): Promise<PgliteDbHandle>;
export async function createDb(opts: CreateDbOptions): Promise<DbHandle>;
export async function createDb(
  dataDirOrOpts?: string | CreateDbOptions,
): Promise<DbHandle> {
  const opts: CreateDbOptions =
    typeof dataDirOrOpts === 'string' || dataDirOrOpts === undefined
      ? { dataDir: dataDirOrOpts }
      : dataDirOrOpts;

  const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl !== undefined && databaseUrl.length > 0) {
    const pool = new Pool({ connectionString: databaseUrl });
    await runMigrations({
      exec: async (sql) => {
        await pool.query(sql);
      },
    });
    const db = drizzleNode(pool, { schema }) as unknown as Db;
    return {
      db,
      close: async () => {
        await pool.end();
      },
    };
  }

  const pglite = new PGlite(opts.dataDir ?? 'memory://');
  await pglite.waitReady;
  await runMigrations(pglite);
  const db = drizzle(pglite, { schema });
  return {
    db,
    pglite,
    close: async () => {
      if (!pglite.closed) await pglite.close();
    },
  };
}
