import { defineTestFlyConfig } from '@testfly/playwright';

export default defineTestFlyConfig({
  baseUrl: 'https://demo.playwright.dev/todomvc',
  apiBaseUrl: 'https://jsonplaceholder.typicode.com',
  env: 'local',
  timeouts: {
    action: 10000,
    navigation: 30000,
  },
  reporting: {
    timeline: true,
    stepScreenshots: 'only-on-failure',
  },
});
