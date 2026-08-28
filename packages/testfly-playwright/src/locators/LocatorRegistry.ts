import { Page, Locator } from '@playwright/test';
import { MobileScreen } from '../mobile/MobileScreen';
import { MobileLocator } from '../mobile/MobileLocator';
import { LocatorDef, SingleLocatorDef, ParsedLocatorItem } from './types';
import { LocatorParser } from './LocatorParser';

export class LocatorRegistry {
  private locatorsMap = new Map<string, LocatorDef>();

  constructor(locatorsDir?: string) {
    if (locatorsDir) {
      this.loadDirectory(locatorsDir);
    }
  }

  /**
   * Register locator definition under a namespace key (e.g. `login.username_input`)
   */
  register(key: string, definition: LocatorDef): this {
    this.locatorsMap.set(key, definition);
    return this;
  }

  /**
   * Load and register all locator files from directory
   */
  loadDirectory(dirPath: string): this {
    const items = LocatorParser.parseDirectory(dirPath);
    for (const item of items) {
      this.locatorsMap.set(item.fullKey, item.definition);
    }
    return this;
  }

  /**
   * Get raw locator definition by key
   */
  get(key: string): LocatorDef | undefined {
    return this.locatorsMap.get(key);
  }

  /**
   * Resolve an actual Playwright Web Locator from a key or definition
   */
  resolveWeb(page: Page, keyOrDef: string | LocatorDef): Locator {
    const def = typeof keyOrDef === 'string' ? this.locatorsMap.get(keyOrDef) : keyOrDef;

    if (!def) {
      if (typeof keyOrDef === 'string') {
        // If not found in registry, fallback to direct CSS/XPath selector
        return page.locator(keyOrDef);
      }
      throw new Error(`Locator definition not found for key: ${keyOrDef}`);
    }

    const singleDef: SingleLocatorDef = (def as any).web || (def as SingleLocatorDef);
    return this.createWebLocator(page, singleDef);
  }

  /**
   * Resolve a Mobilewright MobileLocator from a key or definition
   */
  resolveMobile(screen: MobileScreen, keyOrDef: string | LocatorDef, platform: 'ios' | 'android' = 'android'): MobileLocator {
    const def = typeof keyOrDef === 'string' ? this.locatorsMap.get(keyOrDef) : keyOrDef;

    if (!def) {
      if (typeof keyOrDef === 'string') {
        return screen.locator(keyOrDef);
      }
      throw new Error(`Mobile locator definition not found for key: ${keyOrDef}`);
    }

    const singleDef: SingleLocatorDef =
      (def as any)[platform] || (def as any).mobile || (def as SingleLocatorDef);

    return this.createMobileLocator(screen, singleDef);
  }

  private createWebLocator(page: Page, def: SingleLocatorDef): Locator {
    const type = def.type || 'css';
    const value = def.value || '';
    const exact = def.exact;

    switch (type) {
      case 'role':
        return page.getByRole((def.role || value) as any, {
          name: def.name || value,
          exact,
        });
      case 'label':
        return page.getByLabel(value, { exact });
      case 'text':
        return page.getByText(value, { exact });
      case 'testid':
        return page.getByTestId(value);
      case 'placeholder':
        return page.getByPlaceholder(value, { exact });
      case 'alt':
        return page.getByAltText(value, { exact });
      case 'title':
        return page.getByTitle(value, { exact });
      case 'css':
      case 'xpath':
      default:
        return page.locator(value);
    }
  }

  private createMobileLocator(screen: MobileScreen, def: SingleLocatorDef): MobileLocator {
    const type = def.type || 'label';
    const value = def.value || '';

    switch (type) {
      case 'role':
        return screen.getByRole((def.role || value) as any, { name: def.name || value });
      case 'label':
        return screen.getByLabel(value);
      case 'text':
        return screen.getByText(value);
      case 'testid':
        return screen.getByTestId(value);
      case 'type':
        return screen.getByType(value);
      default:
        return screen.locator(value);
    }
  }
}
