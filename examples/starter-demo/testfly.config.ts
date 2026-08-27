import { defineTestFlyConfig } from '@testfly/playwright';

export default defineTestFlyConfig({
  baseUrl: 'https://www.saucedemo.com',
  apiBaseUrl: 'https://api.escuelajs.co',
  env: 'local',
  database: {
    type: 'memory',
    mock: true,
  },
  mail: {
    provider: 'mock',
  },
  reporting: {
    timeline: true,
    stepScreenshots: 'only-on-failure',
  },
});
