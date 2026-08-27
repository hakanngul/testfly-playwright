import { test as base } from '@playwright/test';
import { FakerClient } from '../faker/FakerClient';

export interface FakerFixture {
  faker: FakerClient;
  data: FakerClient; // Convenient alias
}

export const fakerFixture = base.extend<FakerFixture>({
  faker: async ({}, use) => {
    const fakerClient = new FakerClient();
    await use(fakerClient);
  },
  data: async ({}, use) => {
    const fakerClient = new FakerClient();
    await use(fakerClient);
  },
});
