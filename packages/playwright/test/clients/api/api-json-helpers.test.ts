import { describe, expect, it } from 'vitest';
import { ApiResponse } from '../../../src/clients/api';
import { firstJsonDifference } from '../../../src/clients/api/jsonDiff';
import { TestFlyError } from '../../../src/core/errors';

function res(body: unknown, status = 200): ApiResponse {
  return new ApiResponse({
    status,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    durationMs: 5,
    request: { method: 'GET', url: 'http://api.test/things' },
    truncateAt: 2000,
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

describe('firstJsonDifference', () => {
  it('ignores object key order', () => {
    expect(firstJsonDifference({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBeNull();
  });

  it('names the first differing path', () => {
    expect(firstJsonDifference({ user: { tags: ['x', 'y'] } }, { user: { tags: ['x', 'z'] } })).toBe('$.user.tags[1]: expected "z" but got "y"');
  });

  it('reports missing and unexpected keys, type and length changes', () => {
    expect(firstJsonDifference({ a: 1 }, { a: 1, b: 2 })).toBe('$.b: missing (expected 2)');
    expect(firstJsonDifference({ a: 1, extra: true }, { a: 1 })).toBe('$.extra: unexpected key (value true)');
    expect(firstJsonDifference({ a: '1' }, { a: 1 })).toBe('$.a: expected number 1 but got string "1"');
    expect(firstJsonDifference([1, 2, 3], [1, 2])).toBe('$: expected 2 element(s) but got 3');
    expect(firstJsonDifference({ 'a.b': 1 }, { 'a.b': 2 })).toBe("$['a.b']: expected 2 but got 1");
  });

  it('treats arrays as multisets with ignoreArrayOrder', () => {
    expect(firstJsonDifference([{ id: 2 }, { id: 1 }], [{ id: 1 }, { id: 2 }], { ignoreArrayOrder: true })).toBeNull();
    expect(firstJsonDifference([1, 1, 2], [1, 2, 2], { ignoreArrayOrder: true })).toContain('no element equal to expected $[2]');
    expect(firstJsonDifference([2, 1], [1, 2])).not.toBeNull();
  });

  it('1 and 1.0 are the same JSON number', () => {
    expect(firstJsonDifference(JSON.parse('{"n":1.0}'), { n: 1 })).toBeNull();
  });
});

describe('ApiResponse JSON helpers', () => {
  it('expectJsonEquals compares the whole body semantically and chains', () => {
    const r = res({ id: 7, name: 'Ada', tags: ['b', 'a'] });
    expect(r.expectJsonEquals({ name: 'Ada', tags: ['b', 'a'], id: 7 })).toBe(r);
    r.expectJsonEquals({ id: 7, name: 'Ada', tags: ['a', 'b'] }, { ignoreArrayOrder: true });
    r.expectJsonEquals(['b', 'a'], { path: '$.tags' });
  });

  it('expectJsonEquals failure names the first difference', () => {
    const err = catchErr(() => res({ id: 7, name: 'Ada' }).expectJsonEquals({ id: 7, name: 'Bob' }));
    expect(err.code).toBe('TF_API_ASSERTION_FAILED');
    expect(err.message).toContain('first difference: $.name: expected "Bob" but got "Ada"');
  });

  it('expectJsonEquals on a non-JSON body fails clearly', () => {
    expect(catchErr(() => res('plain text').expectJsonEquals({})).message).toContain('not valid JSON');
  });

  it('expectJsonArrayContains finds an element regardless of key order', () => {
    const r = res({ items: [{ id: 1, name: 'a' }, { name: 'b', id: 2 }] });
    expect(r.expectJsonArrayContains('$.items', { id: 2, name: 'b' })).toBe(r);
    expect(catchErr(() => r.expectJsonArrayContains('$.items', { id: 3 })).message).toContain('to contain {"id":3}');
    expect(catchErr(() => r.expectJsonArrayContains('$.items[0]', 1)).message).toContain('to be an array');
  });

  it('expectStatusRange is inclusive', () => {
    res({}, 200).expectStatusRange(200, 299);
    res({}, 299).expectStatusRange(200, 299);
    expect(catchErr(() => res({}, 404).expectStatusRange(200, 299)).message).toContain('Expected status in 200..299 but got 404');
  });
});
