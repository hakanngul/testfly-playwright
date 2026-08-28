import { defineTestFlyConfig } from '@testfly/playwright';

export default defineTestFlyConfig({
  baseUrl: 'https://demo.playwright.dev/todomvc',
  apiBaseUrl: 'https://api.escuelajs.co/api/v1',
  mail: {
    provider: 'mailpit',
    url: 'http://localhost:8025',
  },
  database: {
    type: 'postgres',
    connectionString: 'postgresql://test:test@localhost:5432/testdb',
  },
  timeouts: {
    action: 10000,
    navigation: 30000,
  },
});
