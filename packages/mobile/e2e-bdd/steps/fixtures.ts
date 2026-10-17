import { test as mobileBdd } from '@testfly/mobile/bdd';
import { createBdd } from '@testfly/playwright/bdd';
import { createFakeDriver } from '../../test/support/fakeDriver';

/** `@testfly/mobile/bdd` with a fresh in-memory device per scenario. */
export const test = mobileBdd.extend({
  mobileDriver: async ({}, use) => {
    await use(createFakeDriver());
  },
});

export const { Given, When, Then } = createBdd(test);
