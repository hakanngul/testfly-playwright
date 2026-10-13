import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { TestFlyError } from '../core/errors';
import { buildLocator } from './build';
import { LocatorParser } from './LocatorParser';
import { normalizeDef } from './schema';
import type { LocatorDef, ParsedLocatorItem } from './types';

const cache = new Map<string, LocatorRegistry>();

/**
 * In-memory catalog of validated locator definitions.
 *
 * Holds read-only data only (no Page), so instances can be shared across tests of a worker.
 * @public
 */
export class LocatorRegistry {
  private readonly map = new Map<string, LocatorDef>();

  /** @param locatorsDir optional directory to load right away. */
  constructor(locatorsDir?: string) {
    if (locatorsDir) this.loadDirectory(locatorsDir);
  }

  /**
   * Load (and cache per absolute directory) a catalog.
   * Throws `TF_LOCATOR_INVALID` with file and key when a definition is invalid.
   */
  static fromDir(dir: string): LocatorRegistry {
    const abs = path.resolve(dir);
    let reg = cache.get(abs);
    if (!reg) {
      reg = new LocatorRegistry(abs);
      cache.set(abs, reg);
    }
    return reg;
  }

  /** Drop cached registries (useful for watch mode and tests). */
  static clearCache(): void {
    cache.clear();
  }

  /** Register a definition (string selector, object or legacy `type/value`). */
  register(key: string, definition: unknown): this {
    this.map.set(key, normalizeDef(definition, key));
    return this;
  }

  /** Load every locator file of a directory and validate cross references. */
  loadDirectory(dirPath: string): this {
    for (const item of LocatorParser.parseDirectory(dirPath)) this.map.set(item.fullKey, item.definition);
    this.validate();
    return this;
  }

  get(key: string): LocatorDef | undefined {
    return this.map.get(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }

  items(): ParsedLocatorItem[] {
    return [...this.map.entries()].map(([fullKey, definition]) => {
      const i = fullKey.indexOf('.');
      return { page: fullKey.slice(0, i), name: fullKey.slice(i + 1), fullKey, definition };
    });
  }

  /** Throws when a `within` target is missing or circular. */
  validate(): void {
    for (const [key, def] of this.map) {
      const defs = [def, ...(def.fallbacks ?? [])];
      for (const d of defs) {
        const seen = [key];
        let cur: LocatorDef | undefined = d;
        while (cur?.within) {
          if (!this.map.has(cur.within)) {
            throw new TestFlyError('TF_LOCATOR_INVALID', `Locator "${key}": "within: ${cur.within}" does not exist.`, {
              hint: 'Use the full key of another locator, e.g. "login.form".',
              details: { key },
            });
          }
          if (seen.includes(cur.within)) {
            throw new TestFlyError('TF_LOCATOR_INVALID', `Locator "${key}": circular "within" chain ${[...seen, cur.within].join(' → ')}.`, { details: { key } });
          }
          seen.push(cur.within);
          cur = this.map.get(cur.within);
        }
      }
    }
  }

  /**
   * Build the plain Playwright locator (primary + YAML fallbacks, no healing).
   * Throws `TF_LOCATOR_NOT_FOUND` for unknown keys.
   */
  resolve(page: Page, key: string): Locator {
    return buildLocator(page, this.require(key), (k) => this.map.get(k));
  }

  /** Definition of a key or `TF_LOCATOR_NOT_FOUND` (with close-match suggestions). */
  require(key: string): LocatorDef {
    const def = this.map.get(key);
    if (def) return def;
    const page = key.split('.')[0];
    const near = this.keys().filter((k) => k.startsWith(`${page}.`)).slice(0, 5);
    throw new TestFlyError('TF_LOCATOR_NOT_FOUND', `Locator "${key}" is not defined in the catalog.`, {
      hint: near.length ? `Known keys on "${page}": ${near.join(', ')}` : 'Add it to a locators/<page>.yaml file and run "testfly locators".',
      details: { key },
    });
  }
}
