import { test as base } from '@playwright/test';
import { MockClient } from '../clients/mock/MockClient';


export interface MockFixture {
  mock: MockClient;
}

export const mockFixture = base.extend<MockFixture>({
  mock: async ({ page }, use) => {
    const mockClient = new MockClient(page);
    await use(mockClient);
    await mockClient.reset();
  },
});
