import { mobileTest } from '../src';
import { createFakeDriver } from '../test/support/fakeDriver';

/** `mobileTest` with a fresh in-memory device per test. */
export const test = mobileTest.extend({
  mobileDriver: async ({}, use) => {
    await use(createFakeDriver());
  },
});
