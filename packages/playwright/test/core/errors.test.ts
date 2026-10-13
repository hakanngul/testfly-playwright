import { describe, expect, it } from 'vitest';
import { importOptional, isTestFlyError, TestFlyError } from '../../src/core/errors';

describe('TestFlyError', () => {
  it('formats code, message, hint and docs link', () => {
    const cause = new Error('root');
    const error = new TestFlyError('TF_DB_NOT_CONFIGURED', 'db missing', { hint: 'configure it', cause, details: { a: 1 } });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TestFlyError');
    expect(error.code).toBe('TF_DB_NOT_CONFIGURED');
    expect(error.message).toContain('[TF_DB_NOT_CONFIGURED] db missing');
    expect(error.message).toContain('configure it');
    expect(error.docsUrl).toBe('https://testfly.dev/docs/playwright/errors#tf-db-not-configured');
    expect(error.message).toContain(error.docsUrl);
    expect(error.hint).toBe('configure it');
    expect(error.details).toEqual({ a: 1 });
    expect(error.cause).toBe(cause);
  });

  it('works without options', () => {
    const error = new TestFlyError('TF_INTERNAL', 'boom');
    expect(error.message).not.toContain('→');
    expect(error.cause).toBeUndefined();
  });

  it('isTestFlyError narrows by code', () => {
    const error = new TestFlyError('TF_MAIL_TIMEOUT', 'x');
    expect(isTestFlyError(error)).toBe(true);
    expect(isTestFlyError(error, 'TF_MAIL_TIMEOUT')).toBe(true);
    expect(isTestFlyError(error, 'TF_INTERNAL')).toBe(false);
    expect(isTestFlyError(new Error('x'))).toBe(false);
    expect(isTestFlyError(null)).toBe(false);
  });
});

describe('importOptional', () => {
  it('loads an installed module', async () => {
    const yaml = await importOptional<{ parse: (s: string) => unknown }>('yaml', 'YAML parsing');
    expect(yaml.parse('a: 1')).toEqual({ a: 1 });
  });

  it('throws TF_OPTIONAL_DEPENDENCY_MISSING with an install hint', async () => {
    await expect(importOptional('definitely-not-installed-pkg-xyz', 'The Foo feature')).rejects.toMatchObject({
      name: 'TestFlyError',
      code: 'TF_OPTIONAL_DEPENDENCY_MISSING',
      hint: 'Install it in your project: npm i -D definitely-not-installed-pkg-xyz',
    });
    await expect(importOptional('definitely-not-installed-pkg-xyz', 'The Foo feature')).rejects.toThrow(/The Foo feature requires the optional package "definitely-not-installed-pkg-xyz"/);
  });
});
