import { afterEach, describe, expect, it } from 'vitest';
import { TestContext } from '../../src/core/context';
import { TestFlyError } from '../../src/core/errors';
import { cleanupTmp, makeTmp, withEnv, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

describe('TestContext', () => {
  it('sets, gets and chains', () => {
    const ctx = new TestContext({ baseDir: makeTmp() });
    expect(ctx.set('a', 1).set('b', { c: { d: [10, { e: 'deep' }] } })).toBe(ctx);
    expect(ctx.get('a')).toBe(1);
    expect(ctx.get('b.c.d.0')).toBe(10);
    expect(ctx.get('b.c.d.1.e')).toBe('deep');
    expect(ctx.get('missing')).toBeUndefined();
    expect(ctx.get('missing', 'dflt')).toBe('dflt');
    expect(ctx.has('a')).toBe(true);
    expect(ctx.has('b.c')).toBe(true);
    expect(ctx.has('nope')).toBe(false);
  });

  it('keeps falsy values', () => {
    const ctx = new TestContext({ baseDir: makeTmp() });
    ctx.set('zero', 0).set('empty', '').set('no', false);
    expect(ctx.get('zero', 5)).toBe(0);
    expect(ctx.get('empty', 'x')).toBe('');
    expect(ctx.require('no')).toBe(false);
  });

  it('require returns values and throws TF_CONTEXT_KEY_MISSING with known keys', () => {
    const ctx = new TestContext({ baseDir: makeTmp() });
    ctx.set('known', 1);
    expect(ctx.require<number>('known')).toBe(1);
    try {
      ctx.require('unknown.path');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TestFlyError);
      const e = error as TestFlyError;
      expect(e.code).toBe('TF_CONTEXT_KEY_MISSING');
      expect(e.message).toContain('unknown.path');
      expect(e.details).toMatchObject({ path: 'unknown.path', keys: ['known'] });
      expect(e.hint).toContain('ctx.set');
    }
  });

  it('delete, clear, all and snapshot', () => {
    const ctx = new TestContext({ baseDir: makeTmp() });
    ctx.set('a', 1).set('b', 2);
    expect(ctx.delete('a')).toBe(true);
    expect(ctx.delete('a')).toBe(false);
    expect(ctx.all()).toEqual({ b: 2 });
    expect(ctx.snapshot()).toEqual({ b: 2 });
    ctx.clear();
    expect(ctx.all()).toEqual({});
  });

  it('typed() is a view over the same store', () => {
    const ctx = new TestContext({ baseDir: makeTmp() });
    const typed = ctx.typed<{ userId: string; n: number }>();
    typed.set('userId', 'u1').set('n', 3);
    expect(typed.get('userId')).toBe('u1');
    expect(typed.require('n')).toBe(3);
    expect(typed.has('n')).toBe(true);
    expect(ctx.get('userId')).toBe('u1');
  });

  describe('interpolate', () => {
    it('replaces stored values, dot paths, extras and env', async () => {
      const ctx = new TestContext({ baseDir: makeTmp() });
      ctx.set('name', 'Ada').set('user', { id: 7 });
      await withEnv({ TF_T_ENV_VALUE: 'from-env' }, () => {
        expect(ctx.interpolate('Hi {{name}} #{{ user.id }} {{TF_T_ENV_VALUE}} {{extra.k}}', { extra: { k: 'x' } })).toBe('Hi Ada #7 from-env x');
      });
    });

    it('extras win over stored values and unknown placeholders stay untouched', () => {
      const ctx = new TestContext({ baseDir: makeTmp() });
      ctx.set('a', 'stored');
      expect(ctx.interpolate('{{a}} {{unknown_zzz}}', { a: 'extra' })).toBe('extra {{unknown_zzz}}');
    });
  });

  describe('data loading', () => {
    it('loads JSON under the file name or a namespace', () => {
      const dir = makeTmp();
      writeFiles(dir, { 'users.json': JSON.stringify({ admin: { name: 'root' } }), 'nested/other.json': '[1,2]' });
      const ctx = new TestContext({ baseDir: dir });
      expect(ctx.loadJson('users.json')).toEqual({ admin: { name: 'root' } });
      expect(ctx.get('users.admin.name')).toBe('root');
      ctx.load('nested/other.json', 'numbers');
      expect(ctx.get('numbers.1')).toBe(2);
    });

    it('loads CSV with quoting, BOM, CRLF and blank lines', () => {
      const dir = makeTmp();
      writeFiles(dir, { 'rows.csv': '﻿name,note\r\nAda,"says ""hi"", twice"\r\n\r\nBob,"multi\nline"\r\nEve\r\n' });
      const ctx = new TestContext({ baseDir: dir });
      const rows = ctx.load<Array<Record<string, string>>>('rows.csv');
      expect(rows).toEqual([
        { name: 'Ada', note: 'says "hi", twice' },
        { name: 'Bob', note: 'multi\nline' },
        { name: 'Eve', note: '' },
      ]);
      expect(ctx.get('rows.0.name')).toBe('Ada');
    });

    it('accepts absolute paths', () => {
      const dir = makeTmp();
      writeFiles(dir, { 'a.json': '{"x":1}' });
      const ctx = new TestContext({ baseDir: '/nonexistent' });
      expect(ctx.loadJson(`${dir}/a.json`, 'abs')).toEqual({ x: 1 });
    });

    it('throws TF_DATA_FILE_INVALID for missing or malformed files', () => {
      const dir = makeTmp();
      writeFiles(dir, { 'bad.json': '{nope' });
      const ctx = new TestContext({ baseDir: dir });
      for (const file of ['bad.json', 'missing.json', 'missing.csv']) {
        try {
          ctx.load(file);
          expect.unreachable();
        } catch (error) {
          expect((error as TestFlyError).code).toBe('TF_DATA_FILE_INVALID');
        }
      }
    });

    it('auto-loads JSON from default data directories on first miss and ignores invalid files', () => {
      const dir = makeTmp();
      writeFiles(dir, { 'data/accounts.json': '{"premium":{"email":"p@x.io"}}', 'test-data/broken.json': '{{{', 'fixtures/data/more.json': '{"k":"v"}' });
      const ctx = new TestContext({ baseDir: dir });
      expect(ctx.get('accounts.premium.email')).toBe('p@x.io');
      expect(ctx.get('more.k')).toBe('v');
      expect(ctx.has('broken')).toBe(false);
    });

    it('does not let auto-loaded data override explicit values and honours custom dataDirs', () => {
      const dir = makeTmp();
      writeFiles(dir, { 'custom/cfg.json': '{"a":1}', 'data/ignored.json': '{"a":1}' });
      const ctx = new TestContext({ baseDir: dir, dataDirs: ['custom'] });
      ctx.set('cfg', 'explicit');
      expect(ctx.get('cfg')).toBe('explicit');
      expect(ctx.get('ignored')).toBeUndefined();
    });
  });
});
