import { describe, it, expect, vi } from 'vitest';
import { ApiClient } from '../src/clients/api/ApiClient';
import { TestDataManager } from '../src/core/context/TestDataManager';
import { LocatorRegistry } from '../src/locators/LocatorRegistry';
import { SmartForm } from '../src/quality/form/SmartForm';
import fs from 'fs';
import path from 'path';

describe('API and Web Enhancements (Ponytail Edition)', () => {
  describe('ApiClient - SLA, Response Time and GraphQL', () => {
    it('should measure response duration and responseTimeMs', async () => {
      const mockRaw = {
        status: () => 200,
        statusText: () => 'OK',
        ok: () => true,
        headers: () => ({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
        text: async () => '{"success":true}',
        body: async () => Buffer.from('{"success":true}'),
      };

      const mockRequest: any = {
        get: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 15));
          return mockRaw;
        }),
      };

      const client = new ApiClient(mockRequest, 'https://api.testfly.dev');
      const res = await client.get('/health');

      expect(res.status).toBe(200);
      expect(res.duration).toBeGreaterThanOrEqual(10);
      expect(res.responseTimeMs).toBe(res.duration);
      expect(res.data).toEqual({ success: true });
    });

    it('should execute GraphQL queries via api.graphql()', async () => {
      const mockRaw = {
        status: () => 200,
        statusText: () => 'OK',
        ok: () => true,
        headers: () => ({ 'content-type': 'application/json' }),
        json: async () => ({ data: { country: { name: 'Turkey' } } }),
        text: async () => JSON.stringify({ data: { country: { name: 'Turkey' } } }),
        body: async () => Buffer.from('{}'),
      };

      const mockRequest: any = {
        post: vi.fn().mockResolvedValue(mockRaw),
      };

      const client = new ApiClient(mockRequest, 'https://api.testfly.dev');
      const query = 'query { country(code: "TR") { name } }';
      const res = await client.graphql(query, { test: 123 }, { endpoint: '/custom-graphql' });

      expect(mockRequest.post).toHaveBeenCalledWith(
        'https://api.testfly.dev/custom-graphql',
        expect.objectContaining({
          data: { query, variables: { test: 123 } },
        })
      );
      expect(res.data.data.country.name).toBe('Turkey');
      expect(res.duration).toBeDefined();
    });
  });

  describe('TestDataManager - Data-Driven CSV and JSON Loading', () => {
    const tempDir = path.join(process.cwd(), 'temp-data-test');

    it('should load and parse JSON and CSV test files', () => {
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const jsonPath = path.join(tempDir, 'users.json');
      fs.writeFileSync(jsonPath, JSON.stringify([{ id: 1, name: 'Alice' }]), 'utf8');

      const csvPath = path.join(tempDir, 'data.csv');
      fs.writeFileSync(csvPath, 'id,name,role\n10,Bob,admin\n20,Charlie,user\n', 'utf8');

      const manager = new TestDataManager(tempDir);

      const jsonData = manager.loadJson<any[]>(jsonPath);
      expect(jsonData).toHaveLength(1);
      expect(jsonData[0].name).toBe('Alice');

      const csvData = manager.loadCsv<{ id: string; name: string; role: string }>(csvPath);
      expect(csvData).toHaveLength(2);
      expect(csvData[0].name).toBe('Bob');
      expect(csvData[0].role).toBe('admin');
      expect(csvData[1].name).toBe('Charlie');

      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe('LocatorRegistry - Self-Healing Locator Fallbacks', () => {
    it('should chain fallback locators using Playwright locator.or()', () => {
      const registry = new LocatorRegistry();
      registry.register('login.submit_btn', {
        type: 'css',
        value: '#primary-submit',
        fallbacks: ['button.submit-fallback', { type: 'text', value: 'Submit Now' }],
      });

      const orFn = vi.fn().mockImplementation(() => ({ or: orFn }));
      const mockPage: any = {
        locator: vi.fn().mockReturnValue({ or: orFn }),
        getByText: vi.fn().mockReturnValue({ or: orFn }),
      };

      registry.resolveWeb(mockPage, 'login.submit_btn');

      expect(mockPage.locator).toHaveBeenCalledWith('#primary-submit');
      expect(mockPage.locator).toHaveBeenCalledWith('button.submit-fallback');
      expect(mockPage.getByText).toHaveBeenCalledWith('Submit Now', { exact: undefined });
      expect(orFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('SmartForm - Automated Cascading Form Fill', () => {
    it('should fill inputs and handle boolean values with smart cascaded locators', async () => {
      const fillMock = vi.fn().mockResolvedValue(undefined);
      const checkMock = vi.fn().mockResolvedValue(undefined);

      const mockLocator: any = {
        or: vi.fn().mockReturnThis(),
        first: vi.fn().mockReturnValue({
          fill: fillMock,
          check: checkMock,
          click: vi.fn(),
        }),
      };

      const mockPage: any = {
        getByLabel: vi.fn().mockReturnValue(mockLocator),
        getByPlaceholder: vi.fn().mockReturnValue(mockLocator),
        locator: vi.fn().mockReturnValue(mockLocator),
        getByTestId: vi.fn().mockReturnValue(mockLocator),
      };

      await SmartForm.fill(mockPage, {
        username: 'john_doe',
        agreeTerms: true,
      });

      expect(mockPage.getByLabel).toHaveBeenCalledWith('username', { exact: false });
      expect(mockPage.getByLabel).toHaveBeenCalledWith('agreeTerms', { exact: false });
      expect(fillMock).toHaveBeenCalledWith('john_doe');
      expect(checkMock).toHaveBeenCalled();
    });
  });
});
