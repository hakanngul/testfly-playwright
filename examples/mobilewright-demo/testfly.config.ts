import { defineTestFlyConfig } from '@testfly/playwright';

export default defineTestFlyConfig({
  baseUrl: 'https://demo.playwright.dev',
  mobile: {
    platform: 'ios',
    deviceName: 'iPhone 15',
    bundleId: 'com.testfly.demoapp',
  },
  timeouts: {
    action: 15000,
    navigation: 30000,
  },
});
