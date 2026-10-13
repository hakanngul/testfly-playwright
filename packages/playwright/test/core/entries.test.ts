import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as root from '../../src/index';
import * as configEntry from '../../src/entries/config';
import * as dbEntry from '../../src/entries/db';
import * as mailEntry from '../../src/entries/mail';
import * as locatorsEntry from '../../src/entries/locators';

const pkgRoot = path.resolve(__dirname, '..', '..');

describe('source entry points', () => {
  it('root exports test, expect, fixture sets, errors and session helper', () => {
    for (const name of ['test', 'expect', 'mergeTests', 'coreTest', 'apiTest', 'dataTest', 'locatorTest', 'qualityTest', 'mockTest', 'sessionTest', 'quarantineTest', 'defineSession', 'TestFlyError', 'isTestFlyError', 'TestContext', 'registerHealingStrategy']) {
      expect(root, name).toHaveProperty(name);
    }
  });

  it('root does not export removed aliases or defineConfig (config lives in /config)', () => {
    for (const name of ['defineConfig', 'data', 'state', 'testContext', 'scenarioContext', 'screen', 'mobile', 'auth', 'performance']) {
      expect(root, name).not.toHaveProperty(name);
    }
  });

  it('config entry exports defineConfig and the schema', () => {
    expect(typeof configEntry.defineConfig).toBe('function');
    expect(configEntry.TestFlyOptionsSchema).toBeDefined();
  });

  it('db, mail and locators entries export their clients', () => {
    expect(dbEntry).toHaveProperty('DbClient');
    expect(dbEntry).toHaveProperty('RedisClient');
    expect(mailEntry).toHaveProperty('MailClient');
    expect(locatorsEntry).toHaveProperty('LocatorRegistry');
  });
});

describe.skipIf(!fs.existsSync(path.join(pkgRoot, 'dist', 'config.js')))('built package', () => {
  const req = createRequire(path.join(pkgRoot, 'noop.js'));

  it('CJS entries load and expose the same surface as the source', () => {
    const config = req('@testfly/playwright/config') as typeof configEntry;
    expect(typeof config.defineConfig).toBe('function');
    const main = req('@testfly/playwright') as typeof root;
    expect(typeof main.defineSession).toBe('function');
    expect(Object.keys(main).sort()).toEqual(expect.arrayContaining(['test', 'expect', 'TestFlyError']));
    expect(main).not.toHaveProperty('defineConfig');
  });

  it('ESM entries load', async () => {
    const dir = path.join(pkgRoot, 'dist');
    const config = (await import(path.join(dir, 'config.mjs'))) as typeof configEntry;
    expect(typeof config.defineConfig).toBe('function');
    const main = (await import(path.join(dir, 'index.mjs'))) as typeof root;
    expect(typeof main.test).toBe('function');
  });
});
