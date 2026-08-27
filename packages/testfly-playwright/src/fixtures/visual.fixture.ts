import { test as base } from '@playwright/test';
import { VisualClient } from '../visual/VisualClient';

export interface VisualFixture {
  visual: VisualClient;
}

export const visualFixture = base.extend<VisualFixture>({
  visual: async ({ page }, use) => {
    const visualClient = new VisualClient(page);
    await use(visualClient);
  },
});
