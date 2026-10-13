import path from 'node:path';
import type { Locator } from '@playwright/test';
import { LocatorRegistry, createLocate } from '../locators';
import type { TypedLocatorKey } from '../locators';
import { coreTest } from './core';
import { configBaseDir } from './paths';

/** Test-scoped fixtures of {@link locatorTest}. @public */
export interface LocatorFixtures {
  /** Resolve a YAML locator key to a Playwright `Locator`, healing it when it no longer matches. */
  locate: (key: TypedLocatorKey) => Locator;
}

/** Worker-scoped fixtures of {@link locatorTest}. @public */
export interface LocatorWorkerFixtures {
  /** Parsed YAML locator catalog (cached per worker and directory). */
  locators: LocatorRegistry;
}

/**
 * YAML locator fixture set (`locators`, `locate`).
 * @public
 */
export const locatorTest = coreTest.extend<LocatorFixtures, LocatorWorkerFixtures>({
  locators: [
    async ({ testfly }, use, workerInfo) => {
      await use(LocatorRegistry.fromDir(path.resolve(configBaseDir(workerInfo.config), testfly.locators.dir)));
    },
    { scope: 'worker' },
  ],

  locate: async ({ page, locators, testfly }, use, testInfo) => {
    await use(createLocate({ page, testInfo, registry: locators, healing: testfly.healing, ai: testfly.ai }));
  },
});
