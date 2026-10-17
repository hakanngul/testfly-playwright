import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { Given, Then, When, expect } from '@testfly/playwright/bdd';
import type { ApiResponse } from '@testfly/playwright';

const OPENAPI = {
  openapi: '3.0.3',
  info: { title: 'Users', version: '1' },
  paths: {
    '/users/{id}': {
      get: {
        responses: {
          '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'name', 'role'],
        additionalProperties: false,
        properties: { id: { type: 'integer' }, name: { type: 'string' }, role: { type: 'string', enum: ['admin', 'user'] } },
      },
    },
  },
};

const USER_SCHEMA = { type: 'object', required: ['id', 'name'], properties: { id: { type: 'integer' }, name: { type: 'string' } } };

// ---------------------------------------------------------------- service contracts

Given('a stubbed user service', async ({ mockServer }) => {
  mockServer.get('/users/*', (req) => ({ json: { id: Number(req.path.split('/').pop()), name: 'Ada', role: 'admin' } }));
});

Given('the service returns a user with an unknown role', async ({ mockServer }) => {
  mockServer.get('/users/*', { json: { id: 7, name: 'Ada', role: 'root' } });
});

When('the client fetches user {int}', async ({ api, mockServer, ctx }, id: number) => {
  ctx.set('response', await api.withBaseUrl(mockServer.url).get(`/users/${id}`));
});

Then('the response matches the OpenAPI contract', async ({ ctx }) => {
  await ctx.require<ApiResponse>('response').expectOpenApi(OPENAPI);
});

Then('the response matches the user JSON Schema', async ({ ctx }) => {
  await ctx.require<ApiResponse>('response').expectJsonSchema(USER_SCHEMA);
});

Then('the service received exactly {int} request for user {int}', async ({ mockServer }, times: number, id: number) => {
  mockServer.expectRequest('GET', `/users/${id}`, { times });
});

Then('the OpenAPI check fails mentioning {string}', async ({ ctx }, jsonPath: string) => {
  await expect(ctx.require<ApiResponse>('response').expectOpenApi(OPENAPI)).rejects.toThrow(jsonPath);
});

When(
  'the client fetches users {int}, {int} and {int} in a batch with correlation id {string}',
  async ({ api, mockServer, ctx }, a: number, b: number, c: number, corr: string) => {
    const client = api.withBaseUrl(mockServer.url).withInterceptor({ onRequest: (r) => void (r.headers['x-correlation-id'] = corr) });
    ctx.set('batch', await client.batch([a, b, c].map((id) => (cl) => cl.get(`/users/${id}`)), { concurrency: 2 }));
  },
);

Then('all {int} batch requests succeed', async ({ ctx }, count: number) => {
  const results = ctx.require<Array<{ ok: boolean }>>('batch');
  expect(results).toHaveLength(count);
  expect(results.every((r) => r.ok)).toBe(true);
});

Then('every request to the service carried correlation id {string}', async ({ mockServer }, corr: string) => {
  const history = mockServer.history();
  expect(history.length).toBeGreaterThan(0);
  expect(history.every((r) => r.headers['x-correlation-id'] === corr)).toBe(true);
});

// ---------------------------------------------------------------- Excel & suite context

Given('an Excel workbook with an {string} sheet', async ({ ctx }, sheet: string) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(['email', 'password']);
  ws.addRow(['ada@example.com', 's3cret']);
  ws.addRow(['bob@example.com', 'hunter2']);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tf-bdd-xlsx-')), 'accounts.xlsx');
  await wb.xlsx.writeFile(file);
  ctx.set('workbook', file);
});

When('the {string} sheet is loaded', async ({ ctx }, sheet: string) => {
  await ctx.loadExcel(ctx.require<string>('workbook'), { sheet, namespace: 'accounts' });
});

Then('{int} accounts are available', async ({ ctx }, count: number) => {
  expect(ctx.require<unknown[]>('accounts')).toHaveLength(count);
});

Then("the second account's email is {string}", async ({ ctx }, email: string) => {
  expect(ctx.get('accounts.1.email')).toBe(email);
});

When('the suite context stores {string} = {string}', async ({ suiteCtx }, key: string, value: string) => {
  suiteCtx.set(key, value);
});

Then('the suite context value {string} is {string}', async ({ suiteCtx }, key: string, value: string) => {
  expect(suiteCtx.require<string>(key)).toBe(value);
});
