import { encodeRedisValue, pollKey, requireConfirm, type RedisApi, type RedisValue } from './RedisClient';
import type { WaitForOptions } from './types';

interface Entry {
  value: string;
  expiresAt?: number;
}

/**
 * EXPLICIT in-memory Redis stand-in for unit-style tests. Supports the {@link RedisApi} subset only
 * (glob `*` / `?` patterns in `keys`). It is never used unless you instantiate it.
 *
 * @public
 */
export class MockRedis implements RedisApi {
  private readonly store = new Map<string, Entry>();

  private live(key: string): Entry | undefined {
    const e = this.store.get(key);
    if (e?.expiresAt !== undefined && Date.now() >= e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: RedisValue, ttlSeconds?: number): Promise<void> {
    this.store.set(key, { value: encodeRedisValue(value).toString(), expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });
  }

  async del(...keys: string[]): Promise<number> {
    return keys.filter((k) => this.live(k) !== undefined && this.store.delete(k)).length;
  }

  async exists(key: string): Promise<boolean> {
    return this.live(key) !== undefined;
  }

  async keys(pattern = '*'): Promise<string[]> {
    const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    return [...this.store.keys()].filter((k) => this.live(k) !== undefined && re.test(k));
  }

  async ttl(key: string): Promise<number> {
    const e = this.live(key);
    if (!e) return -2;
    return e.expiresAt === undefined ? -1 : Math.ceil((e.expiresAt - Date.now()) / 1000);
  }

  async flushAll(opts: { confirm: true }): Promise<void> {
    requireConfirm(opts);
    this.store.clear();
  }

  waitFor(key: string, predicate: (value: string | null) => boolean = (v) => v !== null, opts: WaitForOptions = {}): Promise<string | null> {
    return pollKey(() => this.get(key), key, predicate, opts);
  }

  async close(): Promise<void> {
    /* nothing to release */
  }
}
