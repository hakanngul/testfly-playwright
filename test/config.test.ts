import { describe, it, expect } from 'vitest';
import { defineTestFlyConfig, TestFlyConfigSchema, setTestFlyConfig, getTestFlyConfig } from '../src/core/config';


describe('TestFly Configuration Engine', () => {
  it('should validate and set default configuration values', () => {
    const config = defineTestFlyConfig({
      baseUrl: 'https://example.com',
    });

    expect(config.baseUrl).toBe('https://example.com');
    expect(config.env).toBe('local');
    expect(config.timeouts.action).toBe(10000);
    expect(config.timeouts.navigation).toBe(30000);
    expect(config.reporting.timeline).toBe(true);
  });

  it('should parse complex multi-service configurations', () => {
    const config = defineTestFlyConfig({
      baseUrl: 'https://demo.testfly.io',
      apiBaseUrl: 'https://api.testfly.io',
      env: 'staging',
      database: {
        type: 'postgres',
        connectionString: 'postgres://user:pass@localhost:5432/testdb',
      },
      mail: {
        provider: 'mailpit',
        url: 'http://localhost:8025',
      },
      auth: {
        storageStatePath: './custom-auth.json',
        autoSave: true,
      },
    });

    expect(config.env).toBe('staging');
    expect(config.apiBaseUrl).toBe('https://api.testfly.io');
    expect(config.database?.type).toBe('postgres');
    expect(config.mail?.provider).toBe('mailpit');
    expect(config.auth.storageStatePath).toBe('./custom-auth.json');
  });

  it('should throw schema validation error on invalid env', () => {
    expect(() => {
      TestFlyConfigSchema.parse({
        baseUrl: 'https://example.com',
        env: 'invalid-env',
      });
    }).toThrow();
  });
});
