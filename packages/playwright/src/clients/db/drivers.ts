import { TestFlyError, importOptional } from '../../core/errors';
import type { DbOptions } from '../../core/config/schema';
import type { DbQueryResult, SqlDriver, SqlExecutor } from './types';

function requireConnectionString(options: DbOptions): string {
  if (!options.connectionString) {
    throw new TestFlyError('TF_DB_NOT_CONFIGURED', `db.connectionString is required for the "${options.client}" client.`, {
      hint: 'Set testfly.db.connectionString in your config (e.g. from process.env.DATABASE_URL).',
    });
  }
  return options.connectionString;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- driver modules are optional peers without bundled types */

/** PostgreSQL driver backed by `pg`. Placeholders: `$1, $2, …`. @internal */
export async function createPostgresDriver(options: DbOptions): Promise<SqlDriver> {
  const connectionString = requireConnectionString(options);
  const pg: any = await importOptional('pg', 'The postgres db client');
  const Pool = pg.Pool ?? pg.default?.Pool;
  const pool = new Pool({ connectionString, max: options.pool.max });

  const wrap = (exec: { query(sql: string, params?: unknown[]): Promise<any> }): SqlExecutor => ({
    async query(sql, params): Promise<DbQueryResult> {
      const res = await exec.query(sql, params);
      return { rows: res.rows ?? [], rowCount: res.rowCount ?? res.rows?.length ?? 0 };
    },
  });

  return {
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/** MySQL/MariaDB driver backed by `mysql2/promise`. Placeholders: `?`. @internal */
export async function createMysqlDriver(options: DbOptions): Promise<SqlDriver> {
  const uri = requireConnectionString(options);
  const mysql: any = await importOptional('mysql2/promise', 'The mysql db client');
  const createPool = mysql.createPool ?? mysql.default?.createPool;
  const pool = createPool({ uri, connectionLimit: options.pool.max });

  const wrap = (exec: { query(sql: string, params?: unknown[]): Promise<any> }): SqlExecutor => ({
    async query(sql, params): Promise<DbQueryResult> {
      const [result] = await exec.query(sql, params);
      if (Array.isArray(result)) return { rows: result, rowCount: result.length };
      return { rows: [], rowCount: result?.affectedRows ?? 0 };
    },
  });

  return {
    ...wrap(pool),
    async transaction(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const out = await fn(wrap(conn));
        await conn.commit();
        return out;
      } catch (err) {
        await conn.rollback().catch(() => undefined);
        throw err;
      } finally {
        conn.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
