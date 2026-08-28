import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { ParsedLocatorItem, LocatorDef } from './types';

export class LocatorParser {
  /**
   * Parse a raw YAML/JSON content string into locator items for a specific page/namespace
   */
  static parseContent(pageName: string, content: string): ParsedLocatorItem[] {
    let parsed: any;
    try {
      parsed = YAML.parse(content);
    } catch {
      try {
        parsed = JSON.parse(content);
      } catch (err: any) {
        throw new Error(`Failed to parse locator file for page "${pageName}": ${err.message}`);
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    const items: ParsedLocatorItem[] = [];

    for (const [name, def] of Object.entries(parsed)) {
      if (typeof def === 'string') {
        items.push({
          page: pageName,
          name,
          fullKey: `${pageName}.${name}`,
          definition: { type: 'css', value: def },
        });
      } else if (def && typeof def === 'object') {
        items.push({
          page: pageName,
          name,
          fullKey: `${pageName}.${name}`,
          definition: def as LocatorDef,
        });
      }
    }

    return items;
  }

  /**
   * Parse a single YAML / JSON file
   */
  static parseFile(filePath: string): ParsedLocatorItem[] {
    const fileName = path.basename(filePath);
    const pageName = fileName.replace(/\.(yaml|yml|json)$/i, '');
    const content = fs.readFileSync(filePath, 'utf8');
    return this.parseContent(pageName, content);
  }

  /**
   * Scan and parse an entire directory containing `.yaml`, `.yml`, `.json` locator files
   */
  static parseDirectory(dirPath: string): ParsedLocatorItem[] {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return [];
    }

    const files = fs.readdirSync(dirPath);
    const allItems: ParsedLocatorItem[] = [];

    for (const file of files) {
      if (/\.(yaml|yml|json)$/i.test(file)) {
        const fullPath = path.join(dirPath, file);
        const fileItems = this.parseFile(fullPath);
        allItems.push(...fileItems);
      }
    }

    return allItems;
  }
}
