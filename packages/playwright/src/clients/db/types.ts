/** Result of a SQL query. @public */
export interface DbQueryResult<T = unknown> {
  rows: T[];
  /** Rows returned (SELECT) or affected (INSERT/UPDATE/DELETE). */
  rowCount: number;
}

/** @public */
export interface WaitForOptions {
  /** Total time budget in ms (default 10000). */
  timeout?: number;
  /** Poll interval in ms (default 250). */
  interval?: number;
}

/** Low-level executor implemented by each SQL driver. @internal */
export interface SqlExecutor {
  query(sql: string, params: unknown[]): Promise<DbQueryResult>;
}

/** @internal */
export interface SqlDriver extends SqlExecutor {
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Table helper of the explicit in-memory mock database. @public */
export interface MockTable<T = Record<string, unknown>> {
  findById(id: string | number): Promise<T | null>;
  findOne(filter: Partial<T>): Promise<T | null>;
  findMany(filter?: Partial<T>): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string | number, data: Partial<T>): Promise<T>;
  delete(id: string | number): Promise<boolean>;
  count(filter?: Partial<T>): Promise<number>;
  clear(): Promise<void>;
}
