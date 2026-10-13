import { TestFlyError, importOptional } from '../../core/errors';
import type { WaitForOptions } from './types';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Value accepted by `set`; objects are JSON encoded. @public */
export type RedisValue = string | number | Buffer | Record<string, unknown> | unknown[];

/** Common surface of {@link RedisClient} and {@link MockRedis}. @public */
export interface RedisApi {
  get(key: string): Promise<string | null>;
  getJson<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: RedisValue, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<boolean>;
  keys(pattern?: string): Promise<string[]>;
  ttl(key: string): Promise<number>;
  flushAll(opts: { confirm: true }): Promise<void>;
  waitFor(key: string, predicate?: (value: string | null) => boolean, opts?: WaitForOptions): Promise<string | null>;
  close(): Promise<void>;
}

/** @internal */
export function encodeRedisValue(value: RedisValue): string | Buffer {
  if (typeof value === 'string' || Buffer.isBuffer(value)) return value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** @internal */
export async function pollKey(
  read: () => Promise<string | null>,
  key: string,
  predicate: (v: string | null) => boolean,
  opts: WaitForOptions,
): Promise<string | null> {
  const timeout = opts.timeout ?? 10_000;
  const interval = opts.interval ?? 250;
  const deadline = Date.now() + timeout;
  let value: string | null = null;
  for (;;) {
    value = await read();
    if (predicate(value)) return value;
    if (Date.now() + interval > deadline) break;
    await sleep(interval);
  }
  throw new TestFlyError('TF_DB_ASSERTION_FAILED', `Redis key "${key}" did not satisfy the condition within ${timeout}ms (last value: ${value === null ? 'missing' : JSON.stringify(value)}).`);
}

/** @internal */
export function requireConfirm(opts: { confirm: true } | undefined): void {
  if (!opts || opts.confirm !== true) {
    throw new TestFlyError('TF_CONFIG_INVALID', 'flushAll() deletes every key; call it with { confirm: true }.');
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ioredis is an optional peer without bundled types */

/**
 * Real Redis client backed by `ioredis`.
 *
 * @public
 */
export class RedisClient implements RedisApi {
  private constructor(private readonly redis: any) {}

  static async create(options: { url: string }): Promise<RedisClient> {
    const mod: any = await importOptional('ioredis', 'The redis client');
    const Redis = mod.default?.default ?? mod.default ?? mod.Redis ?? mod;
    const redis = new Redis(options.url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    // Avoid unhandled 'error' events crashing the worker; commands will reject instead.
    redis.on('error', () => undefined);
    try {
      await redis.ping();
    } catch (cause) {
      redis.disconnect();
      throw new TestFlyError('TF_DB_NOT_CONFIGURED', 'Could not connect to Redis.', { cause, hint: 'Check testfly.redis.url.' });
    }
    return new RedisClient(redis);
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: RedisValue, ttlSeconds?: number): Promise<void> {
    const v = encodeRedisValue(value);
    if (ttlSeconds) await this.redis.set(key, v, 'EX', ttlSeconds);
    else await this.redis.set(key, v);
  }

  del(...keys: string[]): Promise<number> {
    return keys.length ? this.redis.del(...keys) : Promise.resolve(0);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) > 0;
  }

  /** Keys matching a glob pattern (default `*`), using SCAN (never blocks the server). */
  async keys(pattern = '*'): Promise<string[]> {
    const found = new Set<string>();
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      for (const k of batch) found.add(k);
    } while (cursor !== '0');
    return [...found];
  }

  /** Remaining TTL in seconds; -1 = no expiry, -2 = key missing. */
  ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  /** Delete ALL keys of the selected database. Requires `{ confirm: true }`. */
  async flushAll(opts: { confirm: true }): Promise<void> {
    requireConfirm(opts);
    await this.redis.flushdb();
  }

  waitFor(key: string, predicate: (value: string | null) => boolean = (v) => v !== null, opts: WaitForOptions = {}): Promise<string | null> {
    return pollKey(() => this.get(key), key, predicate, opts);
  }
}
