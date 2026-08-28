import { defineTestFlyConfig } from '@testfly/playwright';

export default defineTestFlyConfig({
  baseUrl: 'https://www.saucedemo.com',
  timeouts: {
    action: 10000,
    navigation: 30000,
  },
});
