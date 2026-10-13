import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiResponse } from '../../../src/clients/api';
import { queryJsonPath } from '../../../src/clients/api/jsonPath';
import { buildCurl, redactHeaders, redactUrl, truncate } from '../../../src/clients/api/curl';
import { TestFlyError } from '../../../src/core/errors';

function res(body: unknown, init: { status?: number; headers?: Record<string, string>; durationMs?: number; truncateAt?: number } = {}): ApiResponse {
  return new ApiResponse({
    status: init.status ?? 200,
    statusText: 'OK',
    headers: init.headers ?? { 'content-type': 'application/json' },
    body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    durationMs: init.durationMs ?? 5,
    request: { method: 'GET', url: 'http://api.test/things?id=1' },
    truncateAt: init.truncateAt ?? 2000,
  });
}

function catchErr(fn: () => unknown): TestFlyError {
  try {
    fn();
  } catch (e) {
    return e as TestFlyError;
  }
  throw new Error('expected function to throw');
}

describe('ApiResponse basics', () => {
  it('parses JSON eagerly and exposes text/body/ok', () => {
    const r = res({ a: 1 });
    expect(r.data).toEqual({ a: 1 });
    expect(r.text()).toBe('{"a":1}');
    expect(r.body()).toEqual(Buffer.from('{"a":1}'));
    expect(r.ok).toBe(true);
  });

  it.each([[199, false], [200, true], [299, true], [300, false], [404, false]])('ok for status %i is %s', (status, ok) => {
    expect(res({}, { status }).ok).toBe(ok);
  });

  it('keeps raw text for non-JSON and does not throw on construction', () => {
    const r = res('<html>');
    expect(r.data).toBe('<html>');
  });
});

describe('ApiResponse assertions', () => {
  it('chain and return this on success', () => {
    const r = res({ a: { b: 2 } }, { headers: { 'x-id': 'abc-1' } });
    expect(r.expectStatus(200).expectOk().expectHeader('X-Id', /abc/).expectHeader('x-id', 'abc-1').expectJson('$.a.b', 2).expectDurationBelow(100)).toBe(r);
  });

  it('expectStatus accepts several codes and fails with code, method, url, status', () => {
    const r = res({ error: 'x' }, { status: 418 });
    expect(r.expectStatus(200, 418)).toBe(r);
    const err = catchErr(() => r.expectStatus(200, 201));
    expect(err).toBeInstanceOf(TestFlyError);
    expect(err.code).toBe('TF_API_ASSERTION_FAILED');
    expect(err.message).toContain('200 or 201');
    expect(err.message).toContain('418');
    expect(err.message).toContain('GET');
    expect(err.message).toContain('http://api.test/things?id=1');
    expect(err.message).toContain('{"error":"x"}');
    expect(err.details).toMatchObject({ method: 'GET', url: 'http://api.test/things?id=1', status: 418 });
  });

  it('expectOk fails for non-2xx', () => {
    const err = catchErr(() => res('nope', { status: 500 }).expectOk());
    expect(err.code).toBe('TF_API_ASSERTION_FAILED');
    expect(err.message).toContain('500');
  });

  it('expectHeader reports a missing header distinctly from a mismatch', () => {
    const r = res({}, { headers: { 'x-a': '1' } });
    expect(catchErr(() => r.expectHeader('x-b', '1')).message).toContain('no such header');
    const mismatch = catchErr(() => r.expectHeader('x-a', '2'));
    expect(mismatch.message).toContain('"1"');
    expect(catchErr(() => r.expectHeader('x-a', /^9/)).code).toBe('TF_API_ASSERTION_FAILED');
  });

  it('expectJson uses deep equality and shows expected and actual', () => {
    const r = res({ list: [{ id: 1 }, { id: 2 }] });
    r.expectJson('$.list', [{ id: 1 }, { id: 2 }]);
    r.expectJson('$.list[*].id', [1, 2]);
    const err = catchErr(() => r.expectJson('$.list[0].id', 9));
    expect(err.message).toContain('$.list[0].id');
    expect(err.message).toContain('9');
    expect(err.message).toContain('got 1');
  });

  it('expectJson on a missing path reports undefined, not a crash', () => {
    const err = catchErr(() => res({ a: 1 }).expectJson('$.zzz', 1));
    expect(err.code).toBe('TF_API_ASSERTION_FAILED');
    expect(err.message).toContain('undefined');
  });

  it('expectDurationBelow fails when too slow', () => {
    const err = catchErr(() => res({}, { durationMs: 500 }).expectDurationBelow(100));
    expect(err.code).toBe('TF_API_ASSERTION_FAILED');
    expect(err.message).toContain('500ms');
  });

  it('body excerpt in assertion errors is truncated at truncateAt', () => {
    const err = catchErr(() => res('z'.repeat(100), { truncateAt: 10, status: 500 }).expectOk());
    expect(err.message).toContain('[truncated 90 chars]');
    expect(err.message).not.toContain('z'.repeat(11));
  });

  it('json() / jsonPath() / expectSchema() on non-JSON throw TF_API_ASSERTION_FAILED with a cause', () => {
    const r = res('not json');
    for (const fn of [() => r.json(), () => r.jsonPath('$.a'), () => r.expectSchema(z.object({}))]) {
      const err = catchErr(fn);
      expect(err.code).toBe('TF_API_ASSERTION_FAILED');
      expect(err.message).toContain('not valid JSON');
      expect(err.cause).toBeDefined();
    }
  });
});

describe('ApiResponse.expectSchema (zod)', () => {
  const schema = z.object({ id: z.number(), name: z.string(), tags: z.array(z.string()).optional() });

  it('returns the parsed (typed) value', () => {
    const out = res({ id: 1, name: 'n', extra: true }).expectSchema(schema);
    expect(out).toEqual({ id: 1, name: 'n' }); // zod strips unknown keys
  });

  it('reports every issue with its path and throws TF_API_SCHEMA_MISMATCH', () => {
    const err = catchErr(() => res({ id: 'x', tags: [1] }).expectSchema(schema));
    expect(err.code).toBe('TF_API_SCHEMA_MISMATCH');
    expect(err.message).toContain('- id:');
    expect(err.message).toContain('- name:');
    expect(err.message).toContain('- tags.0:');
    expect(err.message).toContain('GET http://api.test/things?id=1');
    expect(err.details).toMatchObject({ status: 200 });
  });

  it('uses (root) for root-level issues', () => {
    const err = catchErr(() => res([1]).expectSchema(schema));
    expect(err.message).toContain('(root)');
  });

  it('accepts anything with safeParse (not only zod)', () => {
    const custom = { safeParse: (v: unknown) => ({ success: true as const, data: { wrapped: v } }) };
    expect(res({ a: 1 }).expectSchema(custom as never)).toEqual({ wrapped: { a: 1 } });
  });
});

describe('jsonPath', () => {
  const doc = {
    a: [{ id: 1, n: 'x' }, { id: 2, n: 'y' }, { id: 3 }],
    'k.d': { 'in ner': 5 },
    o: { p: 1, q: 2 },
    nul: null,
    zero: 0,
    f: false,
    e: '',
    arr: [[1, 2], [3]],
  };
  const q = (p: string) => res(doc).jsonPath(p);

  it('root', () => expect(q('$')).toEqual(doc));
  it('dotted keys and indices', () => {
    expect(q('$.a[0].id')).toBe(1);
    expect(q('$.a[1].n')).toBe('y');
    expect(q('$.arr[0][1]')).toBe(2);
  });
  it('negative index', () => {
    expect(q('$.a[-1].id')).toBe(3);
    expect(q('$.a[-3].id')).toBe(1);
    expect(q('$.a[-4]')).toBeUndefined();
  });
  it('out-of-range index', () => expect(q('$.a[3]')).toBeUndefined());
  it('quoted bracket keys, with dots and spaces', () => {
    expect(q("$['k.d']['in ner']")).toBe(5);
    expect(q('$["k.d"]')).toEqual({ 'in ner': 5 });
    expect(q("$.o['p']")).toBe(1);
  });
  it('wildcard [*] returns arrays and skips missing', () => {
    expect(q('$.a[*].id')).toEqual([1, 2, 3]);
    expect(q('$.a[*].n')).toEqual(['x', 'y']);
    expect(q('$.arr[*][*]')).toEqual([1, 2, 3]);
  });
  it('.* over objects and arrays', () => {
    expect(q('$.o.*')).toEqual([1, 2]);
    expect(q('$.arr.*')).toEqual([[1, 2], [3]]);
  });
  it('wildcard with no match returns an empty array (not undefined)', () => {
    expect(q('$.nothing[*]')).toEqual([]);
    expect(q('$.a[*].zzz')).toEqual([]);
  });
  it('missing paths return undefined', () => {
    expect(q('$.missing')).toBeUndefined();
    expect(q('$.o.p.deeper')).toBeUndefined();
    expect(q('$.a.id')).toBeUndefined(); // key on an array
    expect(q('$.o[0]')).toBeUndefined(); // index on an object
    expect(q('$.nul.x')).toBeUndefined();
  });
  it('falsy values are returned as-is', () => {
    expect(q('$.nul')).toBeNull();
    expect(q('$.zero')).toBe(0);
    expect(q('$.f')).toBe(false);
    expect(q('$.e')).toBe('');
  });
  it('does not resolve prototype properties', () => {
    expect(q('$.o.constructor')).toBeUndefined();
    expect(q('$.o.toString')).toBeUndefined();
  });
  it('tolerates whitespace around the path and inside brackets', () => {
    expect(q('  $.a[ 0 ].id ')).toBe(1);
  });

  it.each(['a.b', '$.', '$..a', '$.a[', '$.a[abc]', '$a', '$.a[?(@.id>1)]', '$.a[1:2]'])('invalid path %s throws TF_API_ASSERTION_FAILED', (p) => {
    const err = catchErr(() => q(p));
    expect(err.code).toBe('TF_API_ASSERTION_FAILED');
    expect(err.message).toContain('Invalid JSON path');
  });

  it('queryJsonPath exposes multi flag', () => {
    expect(queryJsonPath(doc, '$.a[0]').multi).toBe(false);
    expect(queryJsonPath(doc, '$.a[*]').multi).toBe(true);
  });
});

describe('curl generation and redaction', () => {
  it('builds a copy-pasteable command', () => {
    const c = buildCurl('post', 'http://x.test/a?b=1', { 'content-type': 'application/json' }, '{"a":1}');
    expect(c).toBe(`curl -X POST 'http://x.test/a?b=1' -H 'content-type: application/json' --data-raw '{"a":1}'`);
  });

  it('shell-quotes single quotes in body and headers', () => {
    const c = buildCurl('POST', 'http://x.test/', { 'x-n': "it's" }, "it's");
    expect(c).toContain(`'x-n: it'\\''s'`);
    expect(c).toContain(`--data-raw 'it'\\''s'`);
  });

  it('omits --data-raw when the body is undefined or empty', () => {
    expect(buildCurl('GET', 'http://x.test/', {})).not.toContain('--data-raw');
    expect(buildCurl('GET', 'http://x.test/', {}, '')).not.toContain('--data-raw');
  });

  it('redacts sensitive headers case-insensitively and keeps others', () => {
    expect(
      redactHeaders({
        Authorization: 'Bearer s',
        'Proxy-Authorization': 'x',
        Cookie: 'a=b',
        'Set-Cookie': 'a=b',
        'X-API-Key': 'k',
        'x-api_key': 'k',
        'X-Auth-Token': 't',
        'X-Client-Secret': 's',
        'X-Signature': 'sig',
        'X-Request-Id': 'visible',
        accept: 'application/json',
      }),
    ).toEqual({
      Authorization: '***',
      'Proxy-Authorization': '***',
      Cookie: '***',
      'Set-Cookie': '***',
      'X-API-Key': '***',
      'x-api_key': '***',
      'X-Auth-Token': '***',
      'X-Client-Secret': '***',
      'X-Signature': '***',
      'X-Request-Id': 'visible',
      accept: 'application/json',
    });
  });

  it('redacts sensitive query params but keeps the rest', () => {
    const out = redactUrl('http://x.test/p?api_key=1&Token=2&password=3&secret=4&sig=ok&signature=5&access-key=6&q=hello');
    const u = new URL(out);
    expect(u.searchParams.get('api_key')).toBe('***');
    expect(u.searchParams.get('Token')).toBe('***');
    expect(u.searchParams.get('password')).toBe('***');
    expect(u.searchParams.get('secret')).toBe('***');
    expect(u.searchParams.get('signature')).toBe('***');
    expect(u.searchParams.get('access-key')).toBe('***');
    expect(u.searchParams.get('q')).toBe('hello');
    expect(u.searchParams.get('sig')).toBe('ok');
    expect(out).not.toContain('%2A');
  });

  it('redactUrl leaves unparsable urls untouched', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });

  it('buildCurl redacts both url and headers', () => {
    const c = buildCurl('GET', 'http://x.test/?token=SECRET', { authorization: 'Bearer SECRET' });
    expect(c).not.toContain('SECRET');
    expect(c).toContain('token=***');
    expect(c).toContain('authorization: ***');
  });

  it('truncate', () => {
    expect(truncate('abc', 3)).toBe('abc');
    expect(truncate('abcdef', 3)).toBe('abc… [truncated 3 chars]');
  });
});
