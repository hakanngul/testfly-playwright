import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { TestFlyError } from '../core/errors';
import { normalizeDef } from './schema';
import type { ParsedLocatorItem } from './types';

/**
 * Parses YAML locator catalogs.
 * @public
 */
export class LocatorParser {
  /** Parse raw YAML (JSON is valid YAML) for a page/namespace. Throws `TF_LOCATOR_INVALID`. */
  static parseContent(pageName: string, content: string, file?: string): ParsedLocatorItem[] {
    let parsed: unknown;
    try {
      parsed = YAML.parse(content);
    } catch (cause) {
      throw new TestFlyError('TF_LOCATOR_INVALID', `Cannot parse locator file ${file ?? `for page "${pageName}"`}: ${(cause as Error).message}`, {
        hint: 'Check the YAML syntax (indentation, quotes).',
        cause,
        details: { file },
      });
    }
    if (parsed === null || parsed === undefined) return [];
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TestFlyError('TF_LOCATOR_INVALID', `Locator file ${file ?? pageName} must be a map of locator names to definitions.`, {
        hint: 'Example:\n  submit:\n    role: button\n    name: Login',
        details: { file },
      });
    }
    const items: ParsedLocatorItem[] = [];
    for (const [name, raw] of Object.entries(parsed as Record<string, unknown>)) {
      const fullKey = `${pageName}.${name}`;
      items.push({ page: pageName, name, fullKey, definition: normalizeDef(raw, fullKey, file), file });
    }
    return items;
  }

  /** Parse a single `.yaml`/`.yml`/`.json` file; the file name is the page name. */
  static parseFile(filePath: string): ParsedLocatorItem[] {
    const pageName = path.basename(filePath).replace(/\.(yaml|yml|json)$/i, '');
    return this.parseContent(pageName, fs.readFileSync(filePath, 'utf8'), filePath);
  }

  /** Parse every locator file in a directory (sorted, non-recursive). Missing dir → `[]`. */
  static parseDirectory(dirPath: string): ParsedLocatorItem[] {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return [];
    const files = fs.readdirSync(dirPath).filter((f) => /\.(yaml|yml|json)$/i.test(f)).sort();
    const all: ParsedLocatorItem[] = [];
    for (const f of files) all.push(...this.parseFile(path.join(dirPath, f)));
    return all;
  }
}
