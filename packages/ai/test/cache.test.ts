import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonFileCache, stableStringify } from '../src/cache/json-file-cache';
import { actionKey, intentKey, normalizeGoal, urlPattern } from '../src/cache/keys';
import { CacheStores } from '../src/cache/stores';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tf-ai-cache-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('JsonFileCache', () => {
  it('round-trips values, creates missing directories, returns undefined for unknown keys', async () => {
    const c = new JsonFileCache<{ n: number }>(join(dir, 'deep', 'nested', 'c.json'));
    expect(await c.get('x')).toBeUndefined();
    expect(await c.all()).toEqual({});
    await c.set('x', { n: 1 });
    expect(await c.get('x')).toEqual({ n: 1 });
    await c.delete('x');
    expect(await c.get('x')).toBeUndefined();
  });

  it('writes keys (also nested) in sorted order with a trailing newline, regardless of insertion order', async () => {
    const file = join(dir, 'c.json');
    const c = new JsonFileCache<Record<string, number>>(file);
    await c.set('zeta', { b: 2, a: 1 });
    await c.set('alpha', { d: 4, c: 3 });
    await c.set('mid', { y: 1, x: 2 });
    const raw = readFileSync(file, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(Object.keys(JSON.parse(raw))).toEqual(['alpha', 'mid', 'zeta']);
    expect(Object.keys(JSON.parse(raw).zeta)).toEqual(['a', 'b']);
    // Same content inserted in other order -> byte identical file
    const file2 = join(dir, 'c2.json');
    const c2 = new JsonFileCache<Record<string, number>>(file2);
    await c2.set('mid', { x: 2, y: 1 });
    await c2.set('alpha', { c: 3, d: 4 });
    await c2.set('zeta', { a: 1, b: 2 });
    expect(readFileSync(file2, 'utf8')).toBe(raw);
  });

  it('stableStringify sorts deeply and keeps arrays ordered', () => {
    expect(stableStringify({ b: [{ z: 1, a: 2 }], a: null })).toBe('{\n  "a": null,\n  "b": [\n    {\n      "a": 2,\n      "z": 1\n    }\n  ]\n}\n');
  });

  it('leaves no tmp or lock files behind (atomic replace)', async () => {
    const c = new JsonFileCache<number>(join(dir, 'c.json'));
    for (let i = 0; i < 5; i++) await c.set(`k${i}`, i);
    expect(readdirSync(dir)).toEqual(['c.json']);
  });

  it('treats a corrupt file as empty and the next write replaces it', async () => {
    const file = join(dir, 'c.json');
    writeFileSync(file, '{ not json');
    const c = new JsonFileCache<number>(file);
    expect(await c.get('a')).toBeUndefined();
    await c.set('a', 1);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ a: 1 });
    writeFileSync(file, '[1,2]');
    expect(await new JsonFileCache<number>(file).all()).toEqual({});
  });

  it('reads see external changes (another instance wrote the file)', async () => {
    const file = join(dir, 'c.json');
    const a = new JsonFileCache<number>(file);
    const b = new JsonFileCache<number>(file);
    await a.set('x', 1);
    expect(await b.get('x')).toBe(1);
    await b.set('x', 22222);
    expect(await a.get('x')).toBe(22222);
  });

  it('update() is an atomic read-modify-write; returning undefined deletes', async () => {
    const c = new JsonFileCache<number>(join(dir, 'c.json'));
    await c.update('n', (cur) => (cur ?? 0) + 1);
    await c.update('n', (cur) => (cur ?? 0) + 1);
    expect(await c.get('n')).toBe(2);
    await c.update('n', () => undefined);
    expect(await c.all()).toEqual({});
  });

  it('parallel async writers (same instance and different instances) lose no entries', async () => {
    const file = join(dir, 'c.json');
    const writers = Array.from({ length: 4 }, () => new JsonFileCache<number>(file));
    await Promise.all(Array.from({ length: 40 }, (_, i) => writers[i % 4].set(`key-${String(i).padStart(2, '0')}`, i)));
    const all = await new JsonFileCache<number>(file).all();
    expect(Object.keys(all)).toHaveLength(40);
    for (let i = 0; i < 40; i++) expect(all[`key-${String(i).padStart(2, '0')}`]).toBe(i);
  });

  it('concurrent update() on the same key does not lose increments', async () => {
    const file = join(dir, 'c.json');
    const writers = Array.from({ length: 3 }, () => new JsonFileCache<number>(file));
    await Promise.all(Array.from({ length: 30 }, (_, i) => writers[i % 3].update('counter', (c) => (c ?? 0) + 1)));
    expect(await writers[0].get('counter')).toBe(30);
  });

  it('breaks a stale lock left by a crashed process', async () => {
    const file = join(dir, 'c.json');
    const lock = `${file}.lock`;
    writeFileSync(lock, '');
    const old = new Date(Date.now() - 60_000);
    const { utimesSync } = await import('node:fs');
    utimesSync(lock, old, old);
    const c = new JsonFileCache<number>(file);
    await c.set('a', 1);
    expect(await c.get('a')).toBe(1);
    expect(existsSync(lock)).toBe(false);
  });

  it('multiple processes writing concurrently lose no entries', async () => {
    const file = join(dir, 'proc.json');
    const script = join(dir, 'w.mjs');
    // The module has no relative imports: transpile it to plain ESM so any Node >= 22 can run it
    // (no reliance on --experimental-transform-types / type stripping flags).
    const source = readFileSync(join(__dirname, '..', 'src', 'cache', 'json-file-cache.ts'), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    writeFileSync(join(dir, 'json-file-cache.mjs'), outputText);
    writeFileSync(
      script,
      `
      import { JsonFileCache } from './json-file-cache.mjs';
      const [file, id] = process.argv.slice(2);
      const c = new JsonFileCache(file);
      (async () => {
        for (let i = 0; i < 15; i++) await c.set('p' + id + '-' + i, 'v' + id);
      })();
      `,
    );
    const nodeArgs = [script, file];
    const run = (id: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const p = spawn(process.execPath, [...nodeArgs, id], { stdio: ['ignore', 'inherit', 'inherit'] });
        p.on('exit', (code) => resolve(code ?? -1));
        p.on('error', reject);
      });
    const codes = await Promise.all(['0', '1', '2', '3'].map(run));
    expect(codes).toEqual([0, 0, 0, 0]);
    const all = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    expect(Object.keys(all)).toHaveLength(60);
    expect(Object.keys(all)).toEqual(Object.keys(all).slice().sort());
    expect(readdirSync(dir).filter((f) => f.startsWith('proc.json') && f !== 'proc.json')).toEqual([]);
  }, 60_000);
});

describe('CacheStores', () => {
  it('puts the three caches under <root>/<cacheDir>', () => {
    const s = new CacheStores(dir, '.cache-x');
    expect(s.actions.file).toBe(join(dir, '.cache-x', 'action-cache.json'));
    expect(s.knowledge.file).toBe(join(dir, '.cache-x', 'page-knowledge.json'));
    expect(s.healed.file).toBe(join(dir, '.cache-x', 'healed-locators.json'));
  });
  it('absolute cacheDir wins over rootDir', () => {
    const s = new CacheStores('/some/root', dir);
    expect(s.actions.file).toBe(join(dir, 'action-cache.json'));
  });
});

describe('urlPattern / keys', () => {
  it.each([
    ['https://x.com/users/123', '/users/:id'],
    ['https://x.com/users/123/', '/users/:id'],
    ['https://x.com/orders/550e8400-e29b-41d4-a716-446655440000/items/9', '/orders/:id/items/:id'],
    ['https://x.com/o/ABCDEF0123456789abcdef', '/o/:id'],
    ['https://x.com/products/shoes?color=red#top', '/products/shoes'],
    ['https://x.com/', '/'],
    ['https://x.com', '/'],
    ['https://x.com/app#/cart/42?x=1', '/app/cart/:id'],
    ['/relative/55?q=1', '/relative/:id'],
    ['https://x.com/v2/users', '/v2/users'],
    ['https://x.com/abc123/def', '/abc123/def'],
  ])('%s -> %s', (url, expected) => {
    expect(urlPattern(url)).toBe(expected);
  });

  it('about:blank / data urls do not throw', () => {
    expect(typeof urlPattern('about:blank')).toBe('string');
    expect(typeof urlPattern('')).toBe('string');
  });

  it('normalizes goals and builds distinct action / intent keys', () => {
    expect(normalizeGoal('  Click   The  LOGIN ')).toBe('click the login');
    expect(actionKey('https://x.com/u/1', 'Log  in')).toBe('/u/:id::log in');
    expect(actionKey('https://x.com/u/2', 'log in')).toBe(actionKey('https://x.com/u/1', 'LOG IN'));
    expect(intentKey('https://x.com/u/1', 'Login Button')).toBe('/u/:id::intent::login button');
    expect(intentKey('https://x.com/', 'a')).not.toBe(actionKey('https://x.com/', 'a'));
  });
});
