import type { MockTable } from './types';

type Row = Record<string, unknown>;

/**
 * EXPLICIT in-memory mock database (`db.client: 'mock'`). It is NOT a SQL engine:
 * use the generic `table(name)` API. Nothing here is pre-seeded and no field is fabricated
 * except an auto-increment `id` (when none is given) and `createdAt` / `updatedAt` timestamps.
 *
 * @public
 */
export class MockDb {
  private readonly store = new Map<string, Map<string | number, Row>>();
  private readonly sequences = new Map<string, number>();

  /** Access (and lazily create) a table. */
  table<T extends Row = Row>(name: string): MockTable<T> {
    if (!this.store.has(name)) this.store.set(name, new Map());
    const rows = this.store.get(name)!;
    const matches = (item: Row, filter?: Partial<T>): boolean =>
      !filter || Object.entries(filter).every(([k, v]) => item[k] === v);

    return {
      findById: async (id) => (rows.has(id) ? ({ ...rows.get(id)! } as T) : null),
      findOne: async (filter) => {
        for (const item of rows.values()) if (matches(item, filter)) return { ...item } as T;
        return null;
      },
      findMany: async (filter) => [...rows.values()].filter((i) => matches(i, filter)).map((i) => ({ ...i }) as T),
      create: async (data) => {
        let id = (data as Row).id as string | number | undefined;
        if (id === undefined) {
          id = (this.sequences.get(name) ?? 0) + 1;
          this.sequences.set(name, id);
        }
        const record: Row = { createdAt: new Date(), ...data, id };
        rows.set(id, record);
        return { ...record } as T;
      },
      update: async (id, data) => {
        const existing = rows.get(id);
        if (!existing) throw new Error(`Record ${id} not found in mock table '${name}'`);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        rows.set(id, updated);
        return { ...updated } as unknown as T;
      },
      delete: async (id) => rows.delete(id),
      count: async (filter) => [...rows.values()].filter((i) => matches(i, filter)).length,
      clear: async () => rows.clear(),
    };
  }

  /** Insert several rows into a table. */
  async seed(table: string, rows: Row[]): Promise<void> {
    const t = this.table(table);
    for (const row of rows) await t.create(row);
  }

  /** Clear one table or all of them. */
  clear(table?: string): void {
    if (table) this.store.get(table)?.clear();
    else for (const s of this.store.values()) s.clear();
  }
}
