import { mergeTests } from '@playwright/test';
import { test as bddTest, createBdd } from '@testfly/playwright/bdd';
import { mobileTest } from './fixtures';

/**
 * `test` for mobile BDD: `@testfly/playwright/bdd` (playwright-bdd + every TestFly fixture) merged with
 * the mobile fixtures. Point playwright-bdd at it with `testfly.bdd.importTestFrom: '@testfly/mobile/bdd'`.
 *
 * @public
 */
export const test = mergeTests(bddTest, mobileTest);

/** Step definition and hook functions bound to {@link test}. @public */
export const { Given, When, Then, Step, Before, After, BeforeAll, AfterAll, BeforeStep, AfterStep } = createBdd(test);

export { expect } from './expect';
