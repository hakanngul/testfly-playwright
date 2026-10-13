import { createBdd, cucumberReporter, defineBddConfig, defineBddProject, defineParameterType, DataTable } from 'playwright-bdd';
import { test as bddBase } from 'playwright-bdd';
import { mergeTests, expect } from '@playwright/test';
import { test as testflyTest } from '../fixtures';

/**
 * `test` for BDD: playwright-bdd's base merged with every TestFly fixture.
 * playwright-bdd imports it from here in the generated spec files.
 *
 * @public
 */
export const test = mergeTests(bddBase, testflyTest);

/** Step definition and hook functions bound to {@link test}. @public */
export const { Given, When, Then, Step, Before, After, BeforeAll, AfterAll, BeforeStep, AfterStep } = createBdd(test);

export { expect, createBdd, cucumberReporter, defineBddConfig, defineBddProject, defineParameterType, DataTable };
export { mergeTests };
