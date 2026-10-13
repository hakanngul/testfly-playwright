import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbClient, MockDb } from '../../../src/clients/db';
import { DbOptionsSchema } from '../../../src/core/config/schema';
import { TestFlyError } from '../../../src/core/errors';


// Fake driver modules injected through importOptional (the real pg / mysql2 are never loaded).
const modules: Record<string, unknown> = {};
vi.mock('../../../src/core/errors', async (orig) => {
  const actual = await orig<typeof import('../../../src/core/errors')>();
  return {
    ...actual,
    importOptional: vi.fn(async (name: string, feature: string) => {
      if (!(name in modules)) throw new actual.TestFlyError('TF_OPTIONAL_DEPENDENCY_MISSING', `${feature} requires the optional package "${name}".`);
      return modules[name];
    }),
  };
});

type QueryFn = (sql: string, params?: unknown[]) => Promise<unknown>;

function pgModule(handler: QueryFn) {
  const log: string[] = [];
  const poolOpts: unknown[] = [];
  const released = vi.fn();
  const end = vi.fn(async () => undefined);
  class Pool {
    constructor(o: unknown) {
      poolOpts.push(o);
    }
    query = (sql: string, params?: unknown[]) => {
      log.push(`pool:${sql}`);
      return handler(sql, params);
    };
    connect = async () => ({
      query: (sql: string, params?: unknown[]) => {
        log.push(`client:${sql}`);
        return handler(sql, params);
      },
      release: released,
    });
    end = end;
  }
  return { mod: { Pool }, log, poolOpts, released, end };
}

function mysqlModule(handler: QueryFn) {
  const log: string[] = [];
  const poolOpts: unknown[] = [];
  const conn = {
    query: (sql: string, params?: unknown[]) => {
      log.push(`conn:${sql}`);
      return handler(sql, params);
    },
    beginTransaction: vi.fn(async () => log.push('BEGIN')),
    commit: vi.fn(async () => log.push('COMMIT')),
    rollback: vi.fn(async () => log.push('ROLLBACK')),
    release: vi.fn(),
  };
  const end = vi.fn(async () => undefined);
  const mod = {
    createPool: (o: unknown) => {
      poolOpts.push(o);
      return {
        query: (sql: string, params?: unknown[]) => {
          log.push(`pool:${sql}`);
          return handler(sql, params);
        },
        getConnection: async () => conn,
        end,
      };
    },
  };
  return { mod, log, poolOpts, conn, end };
}

const pgOpts = (extra: Record<string, unknown> = {}) => DbOptionsSchema.parse({ client: 'postgres', connectionString: 'postgres://u:pw@h/db', ...extra });
const myOpts = (extra: Record<string, unknown> = {}) => DbOptionsSchema.parse({ client: 'mysql', connectionString: 'mysql://u:pw@h/db', ...extra });

beforeEach(() => {
  for (const k of Object.keys(modules)) delete modules[k];
});

describe('DbClient: mock client', () => {
  it('exposes mock and no SQL', async () => {
    const db = await DbClient.create(DbOptionsSchema.parse({ client: 'mock' }));
    expect(db.mock).toBeInstanceOf(MockDb);
    await db.close(); // no-op
  });

  it.each(['query', 'one', 'scalar', 'exec', 'expectRow', 'expectNoRow'] as const)('%s on the mock client throws TF_DB_QUERY_FAILED with a hint', async (method) => {
    const db = await DbClient.create(DbOptionsSchema.parse({ client: 'mock' }));
    const err = await (db[method] as (s: string, p?: unknown[]) => Promise<unknown>)('SELECT 1', []).catch((e: TestFlyError) => e);
    expect(err).toBeInstanceOf(TestFlyError);
    expect(err.code).toBe('TF_DB_QUERY_FAILED');
    expect(err.message).toContain('SELECT 1');
    expect(err.hint).toMatch(/db\.mock\.table/);
  });

  it('expectValue and waitFor and transaction also refuse on mock', async () => {
    const db = await DbClient.create(DbOptionsSchema.parse({ client: 'mock' }));
    await expect(db.expectValue('SELECT 1', [], 1)).rejects.toMatchObject({ code: 'TF_DB_QUERY_FAILED' });
    await expect(db.waitFor('SELECT 1', [], undefined, { timeout: 20, interval: 5 })).rejects.toMatchObject({ code: 'TF_DB_QUERY_FAILED' });
    await expect(db.transaction(async () => 1)).rejects.toMatchObject({ code: 'TF_DB_QUERY_FAILED' });
  });
});

describe('MockDb tables', () => {
  let db: MockDb;
  beforeEach(() => {
    db = new MockDb();
  });

  it('starts empty: nothing is pre-seeded', async () => {
    const t = db.table('users');
    expect(await t.findMany()).toEqual([]);
    expect(await t.count()).toBe(0);
    expect(await t.findById(1)).toBeNull();
    expect(await t.findOne({ name: 'x' })).toBeNull();
  });

  it('create auto-increments ids per table and adds createdAt only', async () => {
    const users = db.table('users');
    const a = await users.create({ name: 'a' });
    const b = await users.create({ name: 'b' });
    const other = await db.table('orders').create({ total: 1 });
    expect([a.id, b.id, other.id]).toEqual([1, 1 + 1, 1]);
    expect(a.createdAt).toBeInstanceOf(Date);
    expect(a.updatedAt).toBeUndefined();
    expect(Object.keys(a).sort()).toEqual(['createdAt', 'id', 'name']);
  });

  it('keeps an explicit id (including strings) and lets data override createdAt', async () => {
    const t = db.table('t');
    const d = new Date(0);
    const r = await t.create({ id: 'abc', createdAt: d });
    expect(r.id).toBe('abc');
    expect(r.createdAt).toBe(d);
    expect(await t.findById('abc')).toMatchObject({ id: 'abc' });
  });

  it('find* return copies (mutating results does not change the store)', async () => {
    const t = db.table('t');
    await t.create({ name: 'a' });
    const found = (await t.findById(1))!;
    found.name = 'mutated';
    expect((await t.findById(1))!.name).toBe('a');
    const many = await t.findMany();
    many[0].name = 'again';
    expect((await t.findOne({ name: 'a' }))!.name).toBe('a');
  });

  it('filters by strict equality over all given fields', async () => {
    const t = db.table('t');
    await db.seed('t', [{ k: 1, g: 'a' }, { k: 1, g: 'b' }, { k: '1', g: 'a' }]);
    expect(await t.count({ k: 1 })).toBe(2);
    expect(await t.count({ k: 1, g: 'a' })).toBe(1);
    expect((await t.findMany({ g: 'a' })).length).toBe(2);
    expect(await t.count({ missing: undefined })).toBe(3);
  });

  it('update merges, sets updatedAt and throws for unknown ids', async () => {
    const t = db.table('t');
    await t.create({ name: 'a', n: 1 });
    const u = await t.update(1, { n: 2 });
    expect(u).toMatchObject({ id: 1, name: 'a', n: 2 });
    expect(u.updatedAt).toBeInstanceOf(Date);
    await expect(t.update(99, {})).rejects.toThrow(/99.*'t'/);
  });

  it('delete reports whether something was removed', async () => {
    const t = db.table('t');
    await t.create({});
    expect(await t.delete(1)).toBe(true);
    expect(await t.delete(1)).toBe(false);
  });

  it('seed inserts rows and clear(table) / clear() empty tables', async () => {
    await db.seed('a', [{ x: 1 }, { x: 2 }]);
    await db.seed('b', [{ y: 1 }]);
    expect(await db.table('a').count()).toBe(2);
    db.clear('a');
    expect(await db.table('a').count()).toBe(0);
    expect(await db.table('b').count()).toBe(1);
    db.clear();
    expect(await db.table('b').count()).toBe(0);
    db.clear('never-existed'); // no throw
  });

  it('table().clear() empties just that table; sequences keep counting', async () => {
    const t = db.table('t');
    await t.create({});
    await t.clear();
    expect(await t.count()).toBe(0);
    expect((await t.create({})).id).toBe(2);
  });

  it('table(name) returns views of the same data', async () => {
    await db.table('t').create({ a: 1 });
    expect(await db.table('t').count()).toBe(1);
  });
});

describe('DbClient: configuration errors', () => {
  it('postgres/mysql without a connection string -> TF_DB_NOT_CONFIGURED', async () => {
    await expect(DbClient.create(DbOptionsSchema.parse({ client: 'postgres' }))).rejects.toMatchObject({ code: 'TF_DB_NOT_CONFIGURED' });
    await expect(DbClient.create(DbOptionsSchema.parse({ client: 'mysql' }))).rejects.toMatchObject({ code: 'TF_DB_NOT_CONFIGURED' });
  });

  it('a missing driver surfaces TF_OPTIONAL_DEPENDENCY_MISSING (no mock fallback)', async () => {
    await expect(DbClient.create(pgOpts())).rejects.toMatchObject({ code: 'TF_OPTIONAL_DEPENDENCY_MISSING' });
    await expect(DbClient.create(myOpts())).rejects.toMatchObject({ code: 'TF_OPTIONAL_DEPENDENCY_MISSING' });
  });
});

describe('DbClient: postgres (fake pg.Pool)', () => {
  it('passes connection string and pool size to the Pool', async () => {
    const f = pgModule(async () => ({ rows: [], rowCount: 0 }));
    modules.pg = f.mod;
    await DbClient.create(pgOpts({ pool: { max: 3 } }));
    expect(f.poolOpts).toEqual([{ connectionString: 'postgres://u:pw@h/db', max: 3 }]);
  });

  it('also works with a module exposing Pool under default', async () => {
    const f = pgModule(async () => ({ rows: [{ a: 1 }], rowCount: 1 }));
    modules.pg = { default: f.mod };
    const db = await DbClient.create(pgOpts());
    expect(await db.scalar('select 1')).toBe(1);
  });

  it('query returns rows/rowCount and forwards params untouched', async () => {
    const seen: unknown[][] = [];
    const f = pgModule(async (_sql, params) => {
      seen.push(params ?? []);
      return { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };
    });
    modules.pg = f.mod;
    const db = await DbClient.create(pgOpts());
    const res = await db.query('select * from t where a = $1 and b = $2', ['x', 7]);
    expect(res).toEqual({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 });
    expect(seen[0]).toEqual(['x', 7]);
  });

  it('rowCount falls back to rows.length and rows to []', async () => {
    modules.pg = pgModule(async (sql) => (sql === 'a' ? { rows: [1, 2, 3] } : { rowCount: 4 })).mod;
    const db = await DbClient.create(pgOpts());
    expect((await db.query('a')).rowCount).toBe(3);
    expect(await db.query('b')).toEqual({ rows: [], rowCount: 4 });
  });

  it('one returns the first row and throws TF_DB_ASSERTION_FAILED when empty', async () => {
    modules.pg = pgModule(async (sql) => ({ rows: sql.includes('none') ? [] : [{ id: 1 }, { id: 2 }] })).mod;
    const db = await DbClient.create(pgOpts());
    expect(await db.one('select')).toEqual({ id: 1 });
    const err = await db.one('select none').catch((e) => e);
    expect(err.code).toBe('TF_DB_ASSERTION_FAILED');
    expect(err.message).toContain('select none');
  });

  it('scalar returns the first column of the first row, undefined when no rows, null for NULL', async () => {
    modules.pg = pgModule(async (sql) => {
      if (sql === 'empty') return { rows: [] };
      if (sql === 'null') return { rows: [{ v: null }] };
      return { rows: [{ count: 42, other: 1 }] };
    }).mod;
    const db = await DbClient.create(pgOpts());
    expect(await db.scalar('count')).toBe(42);
    expect(await db.scalar('empty')).toBeUndefined();
    expect(await db.scalar('null')).toBeNull();
  });

  it('exec returns affected rows', async () => {
    modules.pg = pgModule(async () => ({ rows: [], rowCount: 5 })).mod;
    expect(await (await DbClient.create(pgOpts())).exec('delete from t')).toBe(5);
  });

  it('expectRow returns rows or throws; expectNoRow throws with the row count', async () => {
    modules.pg = pgModule(async (sql) => ({ rows: sql.includes('has') ? [{ a: 1 }, { a: 2 }] : [] })).mod;
    const db = await DbClient.create(pgOpts());
    expect(await db.expectRow('select has')).toHaveLength(2);
    await expect(db.expectRow('select nothing')).rejects.toMatchObject({ code: 'TF_DB_ASSERTION_FAILED' });
    await expect(db.expectNoRow('select nothing')).resolves.toBeUndefined();
    const err = await db.expectNoRow('select has').catch((e) => e);
    expect(err.code).toBe('TF_DB_ASSERTION_FAILED');
    expect(err.message).toContain('found 2');
  });

  it('expectValue uses deep equality and reports expected/actual', async () => {
    modules.pg = pgModule(async () => ({ rows: [{ j: { a: [1] } }] })).mod;
    const db = await DbClient.create(pgOpts());
    await db.expectValue('select j', [], { a: [1] });
    const err = await db.expectValue('select j', [], { a: [2] }).catch((e) => e);
    expect(err.code).toBe('TF_DB_ASSERTION_FAILED');
    expect(err.message).toContain('{"a":[2]}');
    expect(err.message).toContain('{"a":[1]}');
    expect(err.message).toContain('select j');
  });

  it('waitFor polls until rows exist (default predicate) and returns them', async () => {
    let n = 0;
    modules.pg = pgModule(async () => ({ rows: ++n < 3 ? [] : [{ done: true }] })).mod;
    const db = await DbClient.create(pgOpts());
    expect(await db.waitFor('select', [], undefined, { interval: 5, timeout: 2000 })).toEqual([{ done: true }]);
    expect(n).toBe(3);
  });

  it('waitFor honours a custom predicate and times out with TF_DB_ASSERTION_FAILED', async () => {
    modules.pg = pgModule(async () => ({ rows: [{ s: 'pending' }] })).mod;
    const db = await DbClient.create(pgOpts());
    const ok = await db.waitFor<{ s: string }>('select', [], (rows) => rows[0]?.s === 'pending', { interval: 5 });
    expect(ok[0].s).toBe('pending');
    const err = await db.waitFor('select s', [1], (rows) => rows.length === 9, { interval: 10, timeout: 60 }).catch((e) => e);
    expect(err.code).toBe('TF_DB_ASSERTION_FAILED');
    expect(err.message).toContain('60ms');
    expect(err.message).toContain('select s');
    expect(err.message).toContain('1 row(s)');
  });

  it('wraps driver errors in TF_DB_QUERY_FAILED with SQL + cause but without parameter values', async () => {
    modules.pg = pgModule(async () => {
      throw new Error('relation "nope" does not exist');
    }).mod;
    const db = await DbClient.create(pgOpts());
    const err = await db.query('select * from nope where pw = $1', ['hunter2-secret']).catch((e) => e);
    expect(err).toBeInstanceOf(TestFlyError);
    expect(err.code).toBe('TF_DB_QUERY_FAILED');
    expect(err.message).toContain('select * from nope where pw = $1');
    expect(err.message).toContain('relation "nope" does not exist');
    expect(JSON.stringify([err.message, err.details])).not.toContain('hunter2-secret');
    expect(err.details).toEqual({ sql: 'select * from nope where pw = $1', paramCount: 1 });
    expect((err.cause as Error).message).toContain('does not exist');
  });

  it('helpers propagate query failures as TF_DB_QUERY_FAILED', async () => {
    modules.pg = pgModule(async () => {
      throw new Error('boom');
    }).mod;
    const db = await DbClient.create(pgOpts());
    for (const fn of [() => db.one('x'), () => db.scalar('x'), () => db.exec('x'), () => db.expectRow('x'), () => db.expectNoRow('x'), () => db.expectValue('x', [], 1), () => db.waitFor('x')]) {
      await expect(fn()).rejects.toMatchObject({ code: 'TF_DB_QUERY_FAILED' });
    }
  });

  it('transaction commits on success and runs queries on the transaction client', async () => {
    const f = pgModule(async () => ({ rows: [{ v: 1 }], rowCount: 1 }));
    modules.pg = f.mod;
    const db = await DbClient.create(pgOpts());
    const out = await db.transaction(async (tx) => {
      await tx.exec('insert 1');
      return tx.scalar('select v');
    });
    expect(out).toBe(1);
    expect(f.log).toEqual(['client:BEGIN', 'client:insert 1', 'client:select v', 'client:COMMIT']);
    expect(f.released).toHaveBeenCalledTimes(1);
  });

  it('transaction rolls back, releases and rethrows the original error', async () => {
    const f = pgModule(async () => ({ rows: [], rowCount: 0 }));
    modules.pg = f.mod;
    const db = await DbClient.create(pgOpts());
    const boom = new Error('user error');
    await expect(db.transaction(async (tx) => {
      await tx.exec('insert 1');
      throw boom;
    })).rejects.toBe(boom);
    expect(f.log).toEqual(['client:BEGIN', 'client:insert 1', 'client:ROLLBACK']);
    expect(f.released).toHaveBeenCalledTimes(1);
    expect(f.log).not.toContain('client:COMMIT');
  });

  it('a failing statement inside a transaction rolls back and surfaces TF_DB_QUERY_FAILED', async () => {
    const f = pgModule(async (sql) => {
      if (sql === 'bad') throw new Error('syntax');
      return { rows: [], rowCount: 0 };
    });
    modules.pg = f.mod;
    const db = await DbClient.create(pgOpts());
    await expect(db.transaction((tx) => tx.exec('bad'))).rejects.toMatchObject({ code: 'TF_DB_QUERY_FAILED' });
    expect(f.log.at(-1)).toBe('client:ROLLBACK');
  });

  it('a failing ROLLBACK does not mask the original error', async () => {
    const f = pgModule(async (sql) => {
      if (sql === 'ROLLBACK') throw new Error('rollback failed');
      return { rows: [] };
    });
    modules.pg = f.mod;
    const db = await DbClient.create(pgOpts());
    const boom = new Error('orig');
    await expect(db.transaction(async () => { throw boom; })).rejects.toBe(boom);
  });

  it('close ends the pool', async () => {
    const f = pgModule(async () => ({ rows: [] }));
    modules.pg = f.mod;
    const db = await DbClient.create(pgOpts());
    await db.close();
    expect(f.end).toHaveBeenCalledTimes(1);
  });
});

describe('DbClient: mysql (fake mysql2/promise)', () => {
  it('createPool receives uri and connectionLimit; select results map to rows', async () => {
    const f = mysqlModule(async () => [[{ id: 1 }, { id: 2 }], []]);
    modules['mysql2/promise'] = f.mod;
    const db = await DbClient.create(myOpts({ pool: { max: 2 } }));
    expect(f.poolOpts).toEqual([{ uri: 'mysql://u:pw@h/db', connectionLimit: 2 }]);
    expect(await db.query('select ?', [1])).toEqual({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 });
  });

  it('ResultSetHeader results map to affectedRows (rows empty)', async () => {
    modules['mysql2/promise'] = mysqlModule(async () => [{ affectedRows: 3, insertId: 0 }, undefined]).mod;
    const db = await DbClient.create(myOpts());
    expect(await db.exec('update t set a = ?', [1])).toBe(3);
    expect((await db.query('update')).rows).toEqual([]);
  });

  it('supports createPool exposed under default', async () => {
    modules['mysql2/promise'] = { default: mysqlModule(async () => [[{ c: 9 }]]).mod };
    expect(await (await DbClient.create(myOpts())).scalar('select')).toBe(9);
  });

  it('wraps errors without leaking params', async () => {
    modules['mysql2/promise'] = mysqlModule(async () => {
      throw new Error("Unknown column 'x'");
    }).mod;
    const db = await DbClient.create(myOpts());
    const err = await db.query('select x from t where p = ?', ['top-secret']).catch((e) => e);
    expect(err.code).toBe('TF_DB_QUERY_FAILED');
    expect(err.message).toContain('select x from t where p = ?');
    expect(err.message).toContain("Unknown column 'x'");
    expect(JSON.stringify([err.message, err.details])).not.toContain('top-secret');
  });

  it('transaction: begin / commit / release', async () => {
    const f = mysqlModule(async () => [[{ a: 1 }]]);
    modules['mysql2/promise'] = f.mod;
    const db = await DbClient.create(myOpts());
    expect(await db.transaction((tx) => tx.one('select a'))).toEqual({ a: 1 });
    expect(f.log).toEqual(['BEGIN', 'conn:select a', 'COMMIT']);
    expect(f.conn.release).toHaveBeenCalledTimes(1);
  });

  it('transaction: rollback on error and rethrow', async () => {
    const f = mysqlModule(async () => [[]]);
    modules['mysql2/promise'] = f.mod;
    const db = await DbClient.create(myOpts());
    const err = new Error('nope');
    await expect(db.transaction(async () => { throw err; })).rejects.toBe(err);
    expect(f.log).toEqual(['BEGIN', 'ROLLBACK']);
    expect(f.conn.commit).not.toHaveBeenCalled();
    expect(f.conn.release).toHaveBeenCalledTimes(1);
  });

  it('close ends the pool', async () => {
    const f = mysqlModule(async () => [[]]);
    modules['mysql2/promise'] = f.mod;
    await (await DbClient.create(myOpts())).close();
    expect(f.end).toHaveBeenCalledTimes(1);
  });
});
