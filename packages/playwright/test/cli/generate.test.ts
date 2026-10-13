import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenApiGenerator } from '../../src/cli/generator/OpenApiGenerator';
import { runGenerate } from '../../src/cli/generate';
import { capture } from '../helpers/capture';
import { startServer } from '../helpers/server';
import { cleanupTmp, makeTmp, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const SPEC = {
  openapi: '3.0.0',
  info: { title: 'Sample', version: '1' },
  paths: {
    '/users': {
      parameters: [],
      get: { tags: ['Users'], summary: 'List users', responses: { '200': { description: 'OK' } } },
      post: { tags: ['Users', 'Auth'], summary: 'Create user', responses: { '201': { description: 'Created' } } },
    },
    '/orders/{id}': { delete: { tags: ['Orders'], summary: 'Delete order', responses: { '204': { description: 'x' } } } },
    '/health': { get: { responses: {} } },
  },
};

describe('OpenApiGenerator', () => {
  const features = OpenApiGenerator.generateFeatures(SPEC);
  const byTag = (tag: string) => features.find((f) => f.tag === tag);

  it('groups operations by lower-cased tag; untagged go to "default"', () => {
    expect(features.map((f) => f.tag).sort()).toEqual(['auth', 'default', 'orders', 'users']);
    expect(byTag('users')!.fileName).toBe('api-users.feature');
  });

  it('emits English Gherkin with tags and expected status', () => {
    const users = byTag('users')!.content;
    expect(users.startsWith('@api @users\nFeature: API - USERS service tests\n')).toBe(true);
    expect(users).toContain('Scenario: GET /users - List users');
    expect(users).toContain('When I send a "GET" request to "/users"');
    expect(users).toContain('Then the response status is 200');
    expect(users).toContain('When I send a "POST" request with a body to "/users"');
    expect(users).toContain('Then the response status is 201');
    expect(users).toContain('And the response body is not empty');
    expect(users.endsWith('\n')).toBe(true);
    expect(byTag('orders')!.content).toContain('When I send a "DELETE" request to "/orders/{id}"');
    expect(byTag('orders')!.content).toContain('Then the response status is 204');
    expect(byTag('auth')!.content).toContain('POST /users - Create user');
  });

  it('falls back to METHOD path summary and status 200', () => {
    const content = byTag('default')!.content;
    expect(content).toContain('Scenario: GET /health - GET /health');
    expect(content).toContain('Then the response status is 200');
  });

  it('ignores non-HTTP keys (e.g. path-level parameters) and handles empty specs', () => {
    expect(features.flatMap((f) => f.content.match(/PARAMETERS/g) ?? [])).toEqual([]);
    expect(OpenApiGenerator.generateFeatures({})).toEqual([]);
  });

  it('generates English API steps using the api and ctx fixtures', () => {
    const code = OpenApiGenerator.generateApiSteps();
    expect(code).toContain("from '@testfly/playwright/bdd'");
    expect(code).toContain("When('I send a {string} request to {string}'");
    expect(code).toContain("When('I send a {string} request with a body to {string}'");
    expect(code).toContain("Then('the response status is {int}'");
    expect(code).toContain("Then('the response body is not empty'");
    expect(code).not.toMatch(/[çğıöşüÇĞİÖŞÜ]/);
  });

  it('generated steps match generated scenarios (no unmapped steps)', async () => {
    const dir = makeTmp();
    for (const f of features) writeFiles(dir, { [`features/${f.fileName}`]: f.content });
    writeFiles(dir, { 'steps/api.steps.ts': OpenApiGenerator.generateApiSteps() });
    const { StepScanner } = await import('../../src/cli/scanner/StepScanner');
    expect(StepScanner.findUnmappedSteps(path.join(dir, 'features'), path.join(dir, 'steps'))).toEqual([]);
  });
});

describe('testfly generate', () => {
  it('requires --swagger', async () => {
    const { result, warns } = await capture(() => runGenerate({ cwd: makeTmp() }));
    expect(result).toBe(2);
    expect(warns.join('\n')).toContain('--swagger');
  });

  it('generates features and steps from a JSON file and does not overwrite steps', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'openapi.json': JSON.stringify(SPEC) });
    const { result, logs } = await capture(() => runGenerate({ cwd: dir, swagger: 'openapi.json', outputDir: 'feat' }));
    expect(result).toBe(0);
    expect(fs.existsSync(path.join(dir, 'feat', 'api-users.feature'))).toBe(true);
    const stepsFile = path.join(dir, 'steps', 'api-generated.steps.ts');
    expect(fs.existsSync(stepsFile)).toBe(true);
    expect(logs.join('\n')).toContain('Generated 4 feature file(s)');
    fs.writeFileSync(stepsFile, '// edited');
    await capture(() => runGenerate({ cwd: dir, swagger: 'openapi.json', outputDir: 'feat' }));
    expect(fs.readFileSync(stepsFile, 'utf8')).toBe('// edited');
  });

  it('reads YAML specs', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'api.yaml': 'openapi: 3.0.0\npaths:\n  /ping:\n    get:\n      tags: [ops]\n      summary: Ping\n      responses:\n        "200": {description: ok}\n' });
    const { result } = await capture(() => runGenerate({ cwd: dir, swagger: 'api.yaml' }));
    expect(result).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'features', 'api-ops.feature'), 'utf8')).toContain('GET /ping - Ping');
  });

  it('fetches specs from a URL', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(SPEC));
    });
    try {
      const dir = makeTmp();
      const { result } = await capture(() => runGenerate({ cwd: dir, swagger: `${server.url}/openapi.json` }));
      expect(result).toBe(0);
      expect(fs.existsSync(path.join(dir, 'features', 'api-orders.feature'))).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('fails with exit code 1 for missing files, bad JSON and HTTP errors', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'bad.json': '{nope' });
    expect((await capture(() => runGenerate({ cwd: dir, swagger: 'missing.json' }))).result).toBe(1);
    const bad = await capture(() => runGenerate({ cwd: dir, swagger: 'bad.json' }));
    expect(bad.result).toBe(1);
    expect(bad.warns.join('\n')).toContain('Could not read the OpenAPI document');
    const server = await startServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    try {
      const http = await capture(() => runGenerate({ cwd: dir, swagger: `${server.url}/x` }));
      expect(http.result).toBe(1);
      expect(http.warns.join('\n')).toContain('HTTP 404');
    } finally {
      await server.close();
    }
  });
});
