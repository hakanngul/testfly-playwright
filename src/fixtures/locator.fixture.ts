import { Page, Locator } from '@playwright/test';
import { LocatorRegistry } from '../locators/LocatorRegistry';
import { TypedLocatorKey } from '../locators/types';
import path from 'path';

export const defaultLocatorRegistry = new LocatorRegistry(path.resolve(process.cwd(), 'locators'));

export interface LocatorFixture {
  locators: LocatorRegistry;
  locate: (key: TypedLocatorKey) => Locator;
}

export async function locatorsFixture({}: {}, use: (r: LocatorRegistry) => Promise<void>): Promise<void> {
  await use(defaultLocatorRegistry);
}

export async function locateFixture({ page }: { page: Page }, use: (fn: (key: TypedLocatorKey) => Locator) => Promise<void>): Promise<void> {
  const locateFn = (key: TypedLocatorKey): Locator => {
    return defaultLocatorRegistry.resolveWeb(page, key);
  };
  await use(locateFn);
}


