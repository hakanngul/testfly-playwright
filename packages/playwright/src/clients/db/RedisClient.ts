export interface RedisEntry {
  value: any;
  expiresAt?: number;
}

export class RedisClient {
  private store: Map<string, RedisEntry> = new Map();

  /**
   * Set key value with optional TTL in seconds
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Get value by key. Returns null if expired or missing.
   */
  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Check if key exists and is not expired
   */
  async exists(key: string): Promise<boolean> {
    const val = await this.get(key);
    return val !== null;
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  /**
   * List all keys matching optional pattern
   */
  async keys(pattern?: string): Promise<string[]> {
    const now = Date.now();
    const validKeys: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (!pattern || key.includes(pattern) || (pattern === '*' ? true : false)) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  /**
   * Assert that a key exists in Redis/cache
   */
  async assertExists(key: string): Promise<void> {
    const exists = await this.exists(key);
    if (!exists) {
      throw new Error(`❌ Redis Assert Failed: Expected key "${key}" to exist, but it was not found.`);
    }
  }

  /**
   * Assert key has specific expected value
   */
  async assertValue(key: string, expectedValue: any): Promise<void> {
    const actual = await this.get(key);
    if (JSON.stringify(actual) !== JSON.stringify(expectedValue)) {
      throw new Error(
        `❌ Redis Assert Failed: Expected key "${key}" to have value ${JSON.stringify(expectedValue)}, but got ${JSON.stringify(actual)}`
      );
    }
  }

  /**
   * Flush/clear all keys
   */
  async flush(): Promise<void> {
    this.store.clear();
  }
}
