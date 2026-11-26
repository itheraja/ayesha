import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
export interface DB {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
}
function embedded(pg: PGlite): DB {
  return {
    query: async <T>(sql: string, params: unknown[] = []) => pg.query<T>(sql, params),
    transaction: (fn) =>
      pg.transaction((tx) =>
        fn({
          query: async <T>(s: string, p: unknown[] = []) => tx.query<T>(s, p),
          transaction: () => {
            throw Error('Nested transaction');
          },
        }),
      ),
  };
}
export async function memoryDB(): Promise<DB> {
  const pg = new PGlite();
  await pg.exec(await readFile(path.join(process.cwd(), 'supabase/schema.sql'), 'utf8'));
  return embedded(pg);
}
const globals = globalThis as unknown as { ayeshaDB?: Promise<DB> };
export function database(): Promise<DB> {
  if (!globals.ayeshaDB)
    globals.ayeshaDB = connect().catch((e) => {
      delete globals.ayeshaDB;
      throw e;
    });
  return globals.ayeshaDB;
}
async function connect(): Promise<DB> {
  if (process.env.DATABASE_MODE === 'supabase') {
    if (!process.env.DATABASE_URL) throw Error('Set DATABASE_URL for Supabase.');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      lock_timeout: 8000,
      ssl: { rejectUnauthorized: true },
    });
    const db: DB = {
      query: async <T>(s: string, p: unknown[] = []) => {
        const r = await pool.query(s, p);
        return { rows: r.rows as T[] };
      },
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const out = await fn({
            query: async <T>(s: string, p: unknown[] = []) => ({
              rows: (await c.query(s, p)).rows as T[],
            }),
            transaction: () => {
              throw Error('Nested transaction');
            },
          });
          await c.query('COMMIT');
          return out;
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      },
    };
    return db;
  }
  if (process.env.VERCEL)
    throw Error('Local database mode is unsupported on Vercel. Configure Supabase.');
  await mkdir(path.join(process.cwd(), '.data'), { recursive: true });
  const pg = new PGlite(
    process.env.LOCAL_DATABASE_PATH || path.join(process.cwd(), '.data/postgres'),
  );
  await pg.exec(await readFile(path.join(process.cwd(), 'supabase/schema.sql'), 'utf8'));
  const db = embedded(pg);
  const { seed } = await import('./seed');
  await seed(db);
  return db;
}
export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await database()).query<T>(sql, params);
}
