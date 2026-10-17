import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApiResponse } from '../../../src/clients/api';
import { TestFlyError } from '../../../src/core/errors';

const SPEC = path.join(__dirname, 'fixtures', 'openapi.yaml');

function res(body: unknown, status = 200, url = 'https://api.example.com/v1/users/7', method = 'GET'): ApiResponse {
  return new ApiResponse({
    status,
    statusText: 'OK',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: Buffer.from(JSON.stringify(body)),
    durationMs: 5,
    request: { method, url },
    truncateAt: 2000,
  });
}

async function rejection(p: Promise<unknown>): Promise<TestFlyError> {
  try {
    await p;
  } catch (e) {
    return e as TestFlyError;
  }
  throw new Error('expected a rejection');
}

const USER_SCHEMA = {
  type: 'object',
  required: ['id', 'name'],
  properties: { id: { type: 'integer' }, name: { type: 'string', minLength: 1 }, tags: { type: 'array', items: { type: 'string' } } },
};

describe('expectJsonSchema', () => {
  it('passes for a valid body and chains', async () => {
    const r = res({ id: 1, name: 'Ada', tags: ['x'] });
    expect(await r.expectJsonSchema(USER_SCHEMA)).toBe(r);
  });

  it('lists every violation with its JSON path', async () => {
    const err = await rejection(res({ id: 'one', name: '', tags: [1] }).expectJsonSchema(USER_SCHEMA));
    expect(err.code).toBe('TF_API_SCHEMA_MISMATCH');
    expect(err.message).toContain('$.id: must be integer');
    expect(err.message).toContain('$.name: must NOT have fewer than 1 characters');
    expect(err.message).toContain('$.tags[0]: must be string');
  });

  it('supports draft 2020-12 schemas', async () => {
    const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'array', prefixItems: [{ type: 'number' }], items: false };
    await res([1]).expectJsonSchema(schema);
    expect((await rejection(res([1, 2]).expectJsonSchema(schema))).code).toBe('TF_API_SCHEMA_MISMATCH');
  });
});

describe('expectOpenApi', () => {
  it('matches the operation from the URL (server base path, path params) and resolves $refs', async () => {
    await res({ id: 7, name: 'Ada', role: 'admin', nickname: null }).expectOpenApi(SPEC);
  });

  it('prefers literal paths over templates', async () => {
    await res({ id: 1, name: 'Me', role: 'user' }, 200, 'https://api.example.com/v1/users/me').expectOpenApi(SPEC);
  });

  it('reports schema violations, including additionalProperties and enums', async () => {
    const err = await rejection(res({ id: 7, name: 'Ada', role: 'root', extra: 1 }).expectOpenApi(SPEC));
    expect(err.code).toBe('TF_API_SCHEMA_MISMATCH');
    expect(err.message).toContain('OpenAPI GET /users/{id} → 200');
    expect(err.message).toContain('must NOT have additional properties "extra"');
    expect(err.message).toContain('$.role: must be equal to one of the allowed values');
  });

  it('falls back to the status range (4XX)', async () => {
    await res({ error: 'not found' }, 404).expectOpenApi(SPEC);
    expect((await rejection(res({ message: 'x' }, 404).expectOpenApi(SPEC))).message).toContain("must have required property 'error'");
  });

  it('fails clearly for undocumented operations and statuses', async () => {
    expect((await rejection(res({}, 200, 'https://api.example.com/v1/orders').expectOpenApi(SPEC))).message).toContain('no operation for GET /v1/orders');
    expect((await rejection(res({}, 500).expectOpenApi(SPEC))).message).toContain('does not document a 500 response');
  });

  it('accepts an explicit path and an in-memory spec', async () => {
    const spec = { openapi: '3.1.0', paths: { '/x/{id}': { post: { responses: { '201': { content: { 'application/json': { schema: { type: 'object', required: ['ok'] } } } } } } } } };
    await res({ ok: true }, 201, 'http://localhost/anything', 'POST').expectOpenApi(spec, { path: '/x/{id}' });
  });

  it('rejects documents without an openapi version', async () => {
    expect((await rejection(res({}).expectOpenApi({ swagger: '2.0' }))).message).toContain('no "openapi" version field');
  });
});
