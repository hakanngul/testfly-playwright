import { mergeTests, expect } from '@playwright/test';
import { coreTest } from './core';
import { apiTest } from './api';
import { dataTest } from './data';
import { locatorTest } from './locators';
import { qualityTest } from './quality';
import { mockTest } from './mock';
import { sessionTest } from './session';
import { quarantineTest } from './quarantine';

export { coreTest, apiTest, dataTest, locatorTest, qualityTest, mockTest, sessionTest, quarantineTest };
import type { CoreFixtures, CoreWorkerFixtures } from './core';
import type { ApiFixtures } from './api';
import type { DataWorkerFixtures } from './data';
import type { LocatorFixtures, LocatorWorkerFixtures } from './locators';
import type { QualityFixtures } from './quality';
import type { MockFixtures } from './mock';
import type { SessionFixtures } from './session';

export type { CoreFixtures, CoreWorkerFixtures } from './core';
export type { ApiFixtures } from './api';
export type { DataWorkerFixtures } from './data';
export type { LocatorFixtures, LocatorWorkerFixtures } from './locators';
export type { QualityFixtures } from './quality';
export type { MockFixtures } from './mock';
export type { SessionFixtures } from './session';

/**
 * The batteries-included `test`: every TestFly fixture set merged with Playwright's own.
 * Use the individual sets with `mergeTests` for a leaner setup.
 *
 * @public
 */
export const test = mergeTests(coreTest, apiTest, dataTest, locatorTest, qualityTest, mockTest, sessionTest, quarantineTest);

/** Fixture types of the default {@link test}. @public */
export type TestFlyFixtures = CoreFixtures &
  CoreWorkerFixtures &
  ApiFixtures &
  DataWorkerFixtures &
  LocatorFixtures &
  LocatorWorkerFixtures &
  QualityFixtures &
  MockFixtures &
  SessionFixtures;

export { expect, mergeTests };
