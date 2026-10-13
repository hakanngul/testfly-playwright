import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockRedis, RedisClient } from '../../../src/clients/db';
import { TestFlyError } from '../../../src/core/errors';

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

describe('MockRedis', () => {
  let r: MockRedis;
  beforeEach(() => {
    r = new MockRedis();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('get/set/del/exists basics, and missing keys are null (nothing fabricated)', async () => {
    expect(await r.get('a')).toBeNull();
    await r.set('a', 'x');
    expect(await r.get('a')).toBe('x');
    expect(await r.exists('a')).toBe(true);
    expect(await r.del('a', 'missing')).toBe(1);
    expect(await r.exists('a')).toBe(false);
  });

  it('encodes numbers, objects, arrays and Buffers on set', async () => {
    await r.set('n', 5);
    await r.set('o', { a: 1 });
    await r.set('arr', [1, 2]);
    await r.set('b', Buffer.from('buf'));
    expect(await r.get('n')).toBe('5');
    expect(await r.get('o')).toBe('{"a":1}');
    expect(await r.get('arr')).toBe('[1,2]');
    expect(await r.get('b')).toBe('buf');
    expect(await r.getJson('o')).toEqual({ a: 1 });
    expect(await r.getJson('missing')).toBeNull();
  });

  it('getJson on non-JSON throws', async () => {
    await r.set('s', 'not json');
    await expect(r.getJson('s')).rejects.toThrow();
  });

  it('ttl: -2 missing, -1 no expiry, seconds remaining otherwise; keys expire', async () => {
    expect(await r.ttl('k')).toBe(-2);
    await r.set('k', 'v');
    expect(await r.ttl('k')).toBe(-1);
    await r.set('e', 'v', 10);
    expect(await r.ttl('e')).toBe(10);
    vi.advanceTimersByTime(4_000);
    expect(await r.ttl('e')).toBe(6);
    vi.advanceTimersByTime(6_000);
    expect(await r.get('e')).toBeNull();
    expect(await r.exists('e')).toBe(false);
    expect(await r.ttl('e')).toBe(-2);
    expect(await r.keys()).toEqual(['k']);
    expect(await r.del('e')).toBe(0);
  });

  it('keys supports * and ? globs and escapes regex characters', async () => {
    for (const k of ['user:1', 'user:22', 'order:1', 'a.b', 'axb', 'x(1)']) await r.set(k, '1');
    expect((await r.keys('user:*')).sort()).toEqual(['user:1', 'user:22']);
    expect(await r.keys('user:?')).toEqual(['user:1']);
    expect(await r.keys('a.b')).toEqual(['a.b']);
    expect(await r.keys('x(1)')).toEqual(['x(1)']);
    expect(await r.keys('*:1')).toEqual(['user:1', 'order:1']);
    expect((await r.keys()).length).toBe(6);
    expect(await r.keys('nothing*')).toEqual([]);
  });

  it('flushAll requires { confirm: true }', async () => {
    await r.set('a', '1');
    // @ts-expect-error missing confirm on purpose
    await expect(r.flushAll()).rejects.toMatchObject({ code: 'TF_CONFIG_INVALID' });
    // @ts-expect-error wrong confirm on purpose
    await expect(r.flushAll({ confirm: false })).rejects.toMatchObject({ code: 'TF_CONFIG_INVALID' });
    expect(await r.get('a')).toBe('1');
    await r.flushAll({ confirm: true });
    expect(await r.keys()).toEqual([]);
  });

  it('waitFor resolves when the key appears and times out with TF_DB_ASSERTION_FAILED', async () => {
    vi.useRealTimers();
    setTimeout(() => void r.set('late', 'yes'), 30);
    expect(await r.waitFor('late', undefined, { interval: 5, timeout: 2000 })).toBe('yes');
    const err = await r.waitFor('never', undefined, { interval: 10, timeout: 50 }).catch((e) => e);
    expect(err).toBeInstanceOf(TestFlyError);
    expect(err.code).toBe('TF_DB_ASSERTION_FAILED');
    expect(err.message).toContain('"never"');
    expect(err.message).toContain('missing');
    await r.set('v', '1');
    const err2 = await r.waitFor('v', (x) => x === '2', { interval: 10, timeout: 40 }).catch((e) => e);
    expect(err2.message).toContain('"1"');
    await r.close();
  });
});

describe('RedisClient (fake ioredis)', () => {
  interface Fake {
    store: Map<string, string>;
    calls: unknown[][];
    ttls: Map<string, number>;
    instance?: FakeRedis;
    ctorArgs: unknown[];
  }
  let fake: Fake;
  let FakeRedis: new (...a: unknown[]) => any;
  const setup = (over: { pingFails?: boolean; quitFails?: boolean } = {}) => {
    fake = { store: new Map(), calls: [], ttls: new Map(), ctorArgs: [] };
    FakeRedis = class {
      handlers: Record<string, () => void> = {};
      disconnect = vi.fn();
      constructor(...a: unknown[]) {
        fake.ctorArgs = a;
        fake.instance = this as never;
      }
      on(ev: string, fn: () => void) {
        this.handlers[ev] = fn;
        return this;
      }
      async ping() {
        if (over.pingFails) throw new Error('ECONNREFUSED');
        return 'PONG';
      }
      async quit() {
        if (over.quitFails) throw new Error('already closed');
        fake.calls.push(['quit']);
      }
      async get(k: string) {
        return fake.store.get(k) ?? null;
      }
      async set(k: string, v: string | Buffer, ...rest: unknown[]) {
        fake.calls.push(['set', k, v, ...rest]);
        fake.store.set(k, String(v));
        if (rest[0] === 'EX') fake.ttls.set(k, rest[1] as number);
      }
      async del(...keys: string[]) {
        fake.calls.push(['del', ...keys]);
        return keys.filter((k) => fake.store.delete(k)).length;
      }
      async exists(k: string) {
        return fake.store.has(k) ? 1 : 0;
      }
      async scan(cursor: string, _m: string, pattern: string, _c: string, count: number) {
        fake.calls.push(['scan', cursor, pattern, count]);
        const all = [...fake.store.keys()].filter((k) => new RegExp(`^${pattern.replace(/\*/g, '.*')}$`).test(k));
        // two pages: first returns the first half and cursor '7', then the rest and '0'
        const half = Math.ceil(all.length / 2);
        return cursor === '0' ? ['7', all.slice(0, half)] : ['0', all.slice(half)];
      }
      async ttl(k: string) {
        return fake.ttls.get(k) ?? (fake.store.has(k) ? -1 : -2);
      }
      async flushdb() {
        fake.calls.push(['flushdb']);
        fake.store.clear();
      }
    } as never;
    modules.ioredis = { default: FakeRedis };
  };
  type FakeRedis = InstanceType<typeof FakeRedis>;

  beforeEach(() => {
    for (const k of Object.keys(modules)) delete modules[k];
    setup();
  });

  it('missing ioredis -> TF_OPTIONAL_DEPENDENCY_MISSING', async () => {
    delete modules.ioredis;
    await expect(RedisClient.create({ url: 'redis://x' })).rejects.toMatchObject({ code: 'TF_OPTIONAL_DEPENDENCY_MISSING' });
  });

  it('connects with the url, pings, and installs an error handler', async () => {
    await RedisClient.create({ url: 'redis://h:6379/2' });
    expect(fake.ctorArgs[0]).toBe('redis://h:6379/2');
    expect(fake.instance!.handlers.error).toBeTypeOf('function');
    expect(() => fake.instance!.handlers.error()).not.toThrow();
  });

  it('accepts a module exporting the class as Redis or as the module itself', async () => {
    modules.ioredis = { Redis: FakeRedis };
    await RedisClient.create({ url: 'redis://x' });
    modules.ioredis = FakeRedis;
    await RedisClient.create({ url: 'redis://x' });
    modules.ioredis = { default: { default: FakeRedis } };
    await RedisClient.create({ url: 'redis://x' });
  });

  it('ping failure -> TF_DB_NOT_CONFIGURED with cause, and the connection is dropped', async () => {
    setup({ pingFails: true });
    const err = await RedisClient.create({ url: 'redis://x' }).catch((e) => e);
    expect(err.code).toBe('TF_DB_NOT_CONFIGURED');
    expect(err.cause.message).toContain('ECONNREFUSED');
    expect(fake.instance!.disconnect).toHaveBeenCalled();
  });

  it('get/set/getJson/del/exists/ttl', async () => {
    const c = await RedisClient.create({ url: 'redis://x' });
    await c.set('a', 'v');
    await c.set('j', { x: 1 });
    await c.set('n', 3, 60);
    await c.set('b', Buffer.from('raw'));
    expect(fake.calls.filter((x) => x[0] === 'set')).toEqual([
      ['set', 'a', 'v'],
      ['set', 'j', '{"x":1}'],
      ['set', 'n', '3', 'EX', 60],
      ['set', 'b', Buffer.from('raw')],
    ]);
    expect(await c.get('a')).toBe('v');
    expect(await c.get('missing')).toBeNull();
    expect(await c.getJson('j')).toEqual({ x: 1 });
    expect(await c.getJson('missing')).toBeNull();
    expect(await c.exists('a')).toBe(true);
    expect(await c.exists('zz')).toBe(false);
    expect(await c.ttl('n')).toBe(60);
    expect(await c.ttl('a')).toBe(-1);
    expect(await c.ttl('zz')).toBe(-2);
    expect(await c.del('a', 'j')).toBe(2);
  });

  it('del with no keys does not call redis', async () => {
    const c = await RedisClient.create({ url: 'redis://x' });
    expect(await c.del()).toBe(0);
    expect(fake.calls.filter((x) => x[0] === 'del')).toEqual([]);
  });

  it('keys uses SCAN across pages and de-duplicates', async () => {
    const c = await RedisClient.create({ url: 'redis://x' });
    for (const k of ['u:1', 'u:2', 'u:3', 'o:1']) await c.set(k, '1');
    expect((await c.keys('u:*')).sort()).toEqual(['u:1', 'u:2', 'u:3']);
    expect(fake.calls.filter((x) => x[0] === 'scan').length).toBe(2);
    expect(fake.calls.find((x) => x[0] === 'scan')).toEqual(['scan', '0', 'u:*', 200]);
    expect((await c.keys()).length).toBe(4);
  });

  it('flushAll needs confirm', async () => {
    const c = await RedisClient.create({ url: 'redis://x' });
    await c.set('a', '1');
    // @ts-expect-error missing confirm on purpose
    await expect(c.flushAll()).rejects.toMatchObject({ code: 'TF_CONFIG_INVALID' });
    expect(fake.calls.some((x) => x[0] === 'flushdb')).toBe(false);
    await c.flushAll({ confirm: true });
    expect(fake.calls.some((x) => x[0] === 'flushdb')).toBe(true);
  });

  it('waitFor', async () => {
    const c = await RedisClient.create({ url: 'redis://x' });
    setTimeout(() => fake.store.set('later', 'ok'), 20);
    expect(await c.waitFor('later', undefined, { interval: 5, timeout: 2000 })).toBe('ok');
    await expect(c.waitFor('nope', undefined, { interval: 5, timeout: 30 })).rejects.toMatchObject({ code: 'TF_DB_ASSERTION_FAILED' });
  });

  it('close quits, falling back to disconnect when quit fails', async () => {
    const c = await RedisClient.create({ url: 'redis://x' });
    await c.close();
    expect(fake.calls).toContainEqual(['quit']);
    setup({ quitFails: true });
    const c2 = await RedisClient.create({ url: 'redis://x' });
    await c2.close();
    expect(fake.instance!.disconnect).toHaveBeenCalled();
  });
});
