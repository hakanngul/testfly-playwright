import fs from 'node:fs';
import path from 'node:path';
import { TestFlyError } from '../errors';

/** Options for {@link TestContext}. @public */
export interface TestContextOptions {
  /** Base directory for relative data files. Default: `process.cwd()`. */
  baseDir?: string;
  /**
   * Directories (relative to `baseDir`) whose `*.json` files are lazily loaded on first lookup,
   * keyed by file name. Default: `data`, `test-data`, `fixtures/data`.
   */
  dataDirs?: string[];
}

/** Strongly typed view of a {@link TestContext}. @public */
export interface TypedContext<S extends Record<string, unknown>> {
  get<K extends keyof S & string>(key: K): S[K] | undefined;
  set<K extends keyof S & string>(key: K, value: S[K]): this;
  require<K extends keyof S & string>(key: K): S[K];
  has(key: keyof S & string): boolean;
}

const DEFAULT_DATA_DIRS = ['data', 'test-data', path.join('fixtures', 'data')];

/**
 * Per-test key/value store with dot-path lookups, `{{key}}` interpolation and JSON/CSV data loading.
 * Exposed to tests as the `ctx` fixture (a fresh instance per test).
 *
 * @public
 */
export class TestContext {
  private readonly store = new Map<string, unknown>();
  private readonly baseDir: string;
  private readonly dataDirs: string[];
  private autoLoaded = false;

  constructor(options: TestContextOptions = {}) {
    this.baseDir = options.baseDir ?? process.cwd();
    this.dataDirs = options.dataDirs ?? DEFAULT_DATA_DIRS;
  }

  /** Store a value. */
  set<T>(key: string, value: T): this {
    this.store.set(key, value);
    return this;
  }

  /**
   * Read a value by key or dot-path (`user.address.city`, `orders.0.id`).
   * Data files from the default data directories are loaded on first miss.
   */
  get<T = unknown>(path: string, defaultValue?: T): T | undefined {
    const found = this.lookup(path);
    if (found !== undefined) return found as T;
    if (!this.autoLoaded) {
      this.autoLoad();
      const retry = this.lookup(path);
      if (retry !== undefined) return retry as T;
    }
    return defaultValue;
  }

  /** Like {@link get} but throws a descriptive error when the value is missing. */
  require<T = unknown>(path: string): T {
    const value = this.get<T>(path);
    if (value === undefined) {
      throw new TestFlyError('TF_CONTEXT_KEY_MISSING', `ctx: no value stored under "${path}".`, {
        hint: 'Set it with ctx.set(key, value) or load it with ctx.load(file).',
        details: { path, keys: [...this.store.keys()] },
      });
    }
    return value;
  }

  /** Whether a key or dot-path resolves to a value. */
  has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  /** Remove a top-level key. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Remove everything. */
  clear(): void {
    this.store.clear();
    this.autoLoaded = false;
  }

  /** Plain-object copy of all top-level entries. */
  all(): Record<string, unknown> {
    return Object.fromEntries(this.store.entries());
  }

  /** Typed facade: `ctx.typed<{ userId: string }>().get('userId')`. */
  typed<S extends Record<string, unknown>>(): TypedContext<S> {
    return this as unknown as TypedContext<S>;
  }

  /**
   * Replace `{{key}}` / `{{a.b}}` placeholders using stored values, then `process.env`.
   * Unknown placeholders are left untouched.
   */
  interpolate(template: string, extra: Record<string, unknown> = {}): string {
    return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (match, key: string) => {
      const extraValue = resolvePath(extra, key);
      if (extraValue !== undefined && extraValue !== null) return String(extraValue);
      const value = this.get(key);
      if (value !== undefined && value !== null) return String(value);
      const envValue = process.env[key];
      return envValue !== undefined ? envValue : match;
    });
  }

  /** Load a `.json` or `.csv` file (by extension) under `namespace` (default: file name). */
  load<T = unknown>(file: string, namespace?: string): T {
    return path.extname(file).toLowerCase() === '.csv' ? (this.loadCsv(file, namespace) as unknown as T) : this.loadJson<T>(file, namespace);
  }

  /** Load a JSON file. */
  loadJson<T = unknown>(file: string, namespace?: string): T {
    const full = this.resolveFile(file);
    let data: T;
    try {
      data = JSON.parse(fs.readFileSync(full, 'utf8')) as T;
    } catch (cause) {
      throw new TestFlyError('TF_DATA_FILE_INVALID', `Cannot read test data file ${full}.`, { cause });
    }
    this.store.set(namespace ?? path.basename(full, path.extname(full)), data);
    return data;
  }

  /** Load a CSV file (header row required; RFC 4180 quoting supported) as an array of records. */
  loadCsv<T extends Record<string, string> = Record<string, string>>(file: string, namespace?: string): T[] {
    const full = this.resolveFile(file);
    let text: string;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch (cause) {
      throw new TestFlyError('TF_DATA_FILE_INVALID', `Cannot read test data file ${full}.`, { cause });
    }
    const rows = parseCsv(text);
    const [header = [], ...body] = rows;
    const records = body.map((row) => {
      const record: Record<string, string> = {};
      header.forEach((name, i) => {
        record[name.trim()] = row[i] ?? '';
      });
      return record as T;
    });
    this.store.set(namespace ?? path.basename(full, path.extname(full)), records);
    return records;
  }

  /** JSON-serializable snapshot for debugging. */
  snapshot(): Record<string, unknown> {
    return this.all();
  }

  private resolveFile(file: string): string {
    return path.isAbsolute(file) ? file : path.resolve(this.baseDir, file);
  }

  private lookup(pathExpr: string): unknown {
    if (this.store.has(pathExpr)) return this.store.get(pathExpr);
    return resolvePath(this.all(), pathExpr);
  }

  private autoLoad(): void {
    this.autoLoaded = true;
    for (const dir of this.dataDirs) {
      const full = path.resolve(this.baseDir, dir);
      let names: string[];
      try {
        names = fs.readdirSync(full);
      } catch {
        continue;
      }
      for (const name of names.filter((n) => n.endsWith('.json'))) {
        const key = path.basename(name, '.json');
        if (this.store.has(key)) continue;
        try {
          this.store.set(key, JSON.parse(fs.readFileSync(path.join(full, name), 'utf8')));
        } catch {
          /* invalid JSON in auto-discovered files is ignored; load it explicitly to see the error */
        }
      }
    }
  }
}

function resolvePath(root: unknown, expr: string): unknown {
  let current: unknown = root;
  for (const part of expr.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}
