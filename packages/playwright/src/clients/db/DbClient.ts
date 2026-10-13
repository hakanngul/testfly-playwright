import { isDeepStrictEqual } from 'node:util';
import { TestFlyError } from '../../core/errors';
import type { DbOptions } from '../../core/config/schema';
import { createMysqlDriver, createPostgresDriver } from './drivers';
import { MockDb } from './MockDb';
import type { DbQueryResult, SqlExecutor, WaitForOptions } from './types';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * SQL database client (PostgreSQL via `pg`, MySQL via `mysql2`).
 *
 * Placeholders are passed through untouched: use `$1, $2` for postgres and `?` for mysql.
 * With `client: 'mock'` there is NO SQL engine; use {@link DbClient.mock} (an in-memory table store).
 *
 * @public
 */
export class DbClient {
  /** Present only for `client: 'mock'`. */
  readonly mock?: MockDb;

  private constructor(
    private readonly executor: SqlExecutor | undefined,
    private readonly driverClose: (() => Promise<void>) | undefined,
    private readonly runTx: (<T>(fn: (tx: SqlExecutor) => Promise<T>) => Promise<T>) | undefined,
    mock?: MockDb,
  ) {
    this.mock = mock;
  }

  /** Connect according to `options.client`. */
  static async create(options: DbOptions): Promise<DbClient> {
    if (options.client === 'mock') return new DbClient(undefined, undefined, undefined, new MockDb());
    const driver = options.client === 'postgres' ? await createPostgresDriver(options) : await createMysqlDriver(options);
    return new DbClient(driver, () => driver.close(), (fn) => driver.transaction(fn));
  }

  /** Close the connection pool. */
  async close(): Promise<void> {
    await this.driverClose?.();
  }

  /** Run a query. Throws `TF_DB_QUERY_FAILED` (message includes the SQL, never the parameter values). */
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
    if (!this.executor) {
      throw new TestFlyError('TF_DB_QUERY_FAILED', `The mock db client cannot run SQL: ${sql}`, {
        hint: "Use db.mock.table('name') with the in-memory store, or configure client 'postgres' / 'mysql'.",
      });
    }
    try {
      return (await this.executor.query(sql, params)) as DbQueryResult<T>;
    } catch (cause) {
      throw new TestFlyError('TF_DB_QUERY_FAILED', `Query failed: ${sql}\n  ${(cause as Error).message}`, {
        cause,
        details: { sql, paramCount: params.length },
      });
    }
  }

  /** Exactly one row expected; throws when there are none. Returns the first row otherwise. */
  async one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
    const { rows } = await this.query<T>(sql, params);
    if (rows.length === 0) {
      throw new TestFlyError('TF_DB_ASSERTION_FAILED', `Expected at least one row but the query returned none: ${sql}`, { details: { sql } });
    }
    return rows[0];
  }

  /** First column of the first row, or `undefined` when there are no rows. */
  async scalar<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const { rows } = await this.query<Record<string, unknown>>(sql, params);
    if (rows.length === 0) return undefined;
    const first = rows[0];
    return first[Object.keys(first)[0]] as T;
  }

  /** Run a statement and return the number of affected rows. */
  async exec(sql: string, params: unknown[] = []): Promise<number> {
    return (await this.query(sql, params)).rowCount;
  }

  /**
   * Run `fn` inside a transaction (COMMIT on success, ROLLBACK on error).
   * The `tx` argument has the same query helpers as the client.
   */
  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    if (!this.runTx) {
      throw new TestFlyError('TF_DB_QUERY_FAILED', 'Transactions are not supported by the mock db client.');
    }
    return this.runTx((executor) => fn(new DbClient(executor, undefined, undefined)));
  }

  /** Assert the query returns at least one row. Returns the rows. */
  async expectRow<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rows } = await this.query<T>(sql, params);
    if (rows.length === 0) {
      throw new TestFlyError('TF_DB_ASSERTION_FAILED', `Expected at least one row but found none: ${sql}`, { details: { sql } });
    }
    return rows;
  }

  /** Assert the query returns no rows. */
  async expectNoRow(sql: string, params: unknown[] = []): Promise<void> {
    const { rows } = await this.query(sql, params);
    if (rows.length > 0) {
      throw new TestFlyError('TF_DB_ASSERTION_FAILED', `Expected no rows but found ${rows.length}: ${sql}`, { details: { sql, rowCount: rows.length } });
    }
  }

  /** Assert the scalar result equals `expected` (deep equality). */
  async expectValue(sql: string, params: unknown[], expected: unknown): Promise<void> {
    const actual = await this.scalar(sql, params);
    if (!isDeepStrictEqual(actual, expected)) {
      throw new TestFlyError('TF_DB_ASSERTION_FAILED', `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}: ${sql}`, { details: { sql } });
    }
  }

  /**
   * Poll until the query returns rows (or until `predicate(rows)` is true).
   * Throws `TF_DB_ASSERTION_FAILED` on timeout.
   */
  async waitFor<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
    predicate: (rows: T[]) => boolean = (rows) => rows.length > 0,
    opts: WaitForOptions = {},
  ): Promise<T[]> {
    const timeout = opts.timeout ?? 10_000;
    const interval = opts.interval ?? 250;
    const deadline = Date.now() + timeout;
    let rows: T[] = [];
    for (;;) {
      rows = (await this.query<T>(sql, params)).rows;
      if (predicate(rows)) return rows;
      if (Date.now() + interval > deadline) break;
      await sleep(interval);
    }
    throw new TestFlyError('TF_DB_ASSERTION_FAILED', `Condition not met within ${timeout}ms (last result: ${rows.length} row(s)): ${sql}`, {
      details: { sql, timeout, lastRowCount: rows.length },
    });
  }
}
