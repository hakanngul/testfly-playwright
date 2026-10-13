import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) out[k] = sortDeep((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

/** Deterministic, human readable JSON (sorted keys, 2 spaces, trailing newline). @internal */
export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * A flat `key -> value` JSON file, safe for parallel Playwright workers:
 * every write takes a lock file, RE-READS the file, merges the entry and atomically
 * replaces it (tmp + rename). Keys are written in sorted order so diffs stay small.
 *
 * @internal
 */
export class JsonFileCache<T> {
  private memo?: { sig: string; data: Record<string, T> };

  constructor(readonly file: string) {}

  private read(): Record<string, T> {
    if (!existsSync(this.file)) return {};
    try {
      const st = statSync(this.file);
      const sig = `${st.mtimeMs}:${st.size}`;
      if (this.memo?.sig === sig) return this.memo.data;
      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, T>) : {};
      this.memo = { sig, data };
      return data;
    } catch {
      // Corrupt/partial file: treat as empty; the next write replaces it atomically.
      return {};
    }
  }

  async get(key: string): Promise<T | undefined> {
    return this.read()[key];
  }

  async all(): Promise<Record<string, T>> {
    return { ...this.read() };
  }

  async set(key: string, value: T): Promise<void> {
    await this.update(key, () => value);
  }

  async delete(key: string): Promise<void> {
    await this.update(key, () => undefined);
  }

  /** Atomic read-modify-write of one entry. Returning `undefined` deletes it. */
  async update(key: string, fn: (current: T | undefined) => T | undefined): Promise<void> {
    await this.withLock(() => {
      this.memo = undefined;
      const data = { ...this.read() };
      const next = fn(data[key]);
      if (next === undefined) delete data[key];
      else data[key] = next;
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(tmp, stableStringify(data));
      renameSync(tmp, this.file);
      this.memo = undefined;
    });
  }

  private async withLock(fn: () => void): Promise<void> {
    const lock = `${this.file}.lock`;
    mkdirSync(dirname(this.file), { recursive: true });
    const deadline = Date.now() + 10_000;
    for (;;) {
      try {
        closeSync(openSync(lock, 'wx'));
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        try {
          // Break stale locks left by a crashed worker.
          if (Date.now() - statSync(lock).mtimeMs > 5_000) unlinkSync(lock);
        } catch {
          /* raced with the owner releasing it */
        }
        if (Date.now() > deadline) throw new Error(`Timed out waiting for cache lock ${lock}`);
        await sleep(15 + Math.random() * 35);
      }
    }
    try {
      fn();
    } finally {
      try {
        unlinkSync(lock);
      } catch {
        /* already gone */
      }
    }
  }
}
