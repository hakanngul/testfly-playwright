import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { LocatorRegistry } from '../../src/locators/LocatorRegistry';
import { LocatorTypeGen } from '../../src/locators/LocatorTypeGen';
import { LocatorParser } from '../../src/locators/LocatorParser';
import { describeDef } from '../../src/locators/describe';
import { TestFlyError } from '../../src/core/errors';
import { tmpCatalog } from '../helpers/locator-env';

function err(fn: () => unknown): TestFlyError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(TestFlyError);
    return e as TestFlyError;
  }
  throw new Error('expected throw');
}

beforeEach(() => LocatorRegistry.clearCache());

describe('LocatorRegistry', () => {
  it('loads a directory and exposes get/has/keys/items', () => {
    const dir = tmpCatalog({ 'login.yaml': 'user: "#u"\nform:\n  css: form\n', 'home.yaml': 'hero:\n  testid: hero\n' });
    const reg = new LocatorRegistry(dir);
    expect(reg.keys().sort()).toEqual(['home.hero', 'login.form', 'login.user']);
    expect(reg.has('login.user')).toBe(true);
    expect(reg.get('login.user')).toEqual({ css: '#u' });
    expect(reg.get('nope.x')).toBeUndefined();
    const item = reg.items().find((i) => i.fullKey === 'login.form');
    expect(item).toMatchObject({ page: 'login', name: 'form' });
  });

  it('register() validates', () => {
    const reg = new LocatorRegistry().register('p.a', '#a').register('p.b', { type: 'text', value: 'hi' });
    expect(reg.get('p.a')).toEqual({ css: '#a' });
    expect(reg.get('p.b')).toEqual({ text: 'hi' });
    expect(err(() => reg.register('p.c', { css: 'a', text: 'b' })).code).toBe('TF_LOCATOR_INVALID');
  });

  it('fromDir caches per absolute dir and clearCache resets', () => {
    const dir = tmpCatalog({ 'a.yaml': 'x: "#x"' });
    const r1 = LocatorRegistry.fromDir(dir);
    const r2 = LocatorRegistry.fromDir(dir);
    expect(r2).toBe(r1);
    // relative form of the same dir resolves to the same abs path
    const rel = path.relative(process.cwd(), dir);
    expect(LocatorRegistry.fromDir(rel)).toBe(r1);
    // trailing slash too
    expect(LocatorRegistry.fromDir(dir + path.sep)).toBe(r1);
    const other = tmpCatalog({ 'a.yaml': 'x: "#x"' });
    expect(LocatorRegistry.fromDir(other)).not.toBe(r1);
    // cached registry ignores later disk edits until cleared
    fs.writeFileSync(path.join(dir, 'a.yaml'), 'x: "#changed"');
    expect(LocatorRegistry.fromDir(dir).get('a.x')).toEqual({ css: '#x' });
    LocatorRegistry.clearCache();
    const r3 = LocatorRegistry.fromDir(dir);
    expect(r3).not.toBe(r1);
    expect(r3.get('a.x')).toEqual({ css: '#changed' });
  });

  it('fromDir on a missing dir gives an empty registry', () => {
    expect(LocatorRegistry.fromDir('/nonexistent/tf-dir').keys()).toEqual([]);
  });

  it('fromDir does not cache a failing load', () => {
    const dir = tmpCatalog({ 'a.yaml': 'x:\n  css: a\n  text: b\n' });
    expect(err(() => LocatorRegistry.fromDir(dir)).code).toBe('TF_LOCATOR_INVALID');
    fs.writeFileSync(path.join(dir, 'a.yaml'), 'x: "#ok"');
    expect(LocatorRegistry.fromDir(dir).get('a.x')).toEqual({ css: '#ok' });
  });

  it('require unknown key -> TF_LOCATOR_NOT_FOUND with suggestions', () => {
    const reg = new LocatorRegistry().register('login.user', '#u').register('login.pass', '#p');
    const e = err(() => reg.require('login.usr'));
    expect(e.code).toBe('TF_LOCATOR_NOT_FOUND');
    expect(e.hint).toContain('login.user');
    expect(e.details).toEqual({ key: 'login.usr' });
    const e2 = err(() => reg.require('zzz.k'));
    expect(e2.code).toBe('TF_LOCATOR_NOT_FOUND');
    expect(e2.hint).toContain('locators/<page>.yaml');
    expect(reg.require('login.user')).toEqual({ css: '#u' });
  });

  it('validate: missing within target', () => {
    const dir = tmpCatalog({ 'a.yaml': 'x:\n  css: li\n  within: a.ghost\n' });
    const e = err(() => new LocatorRegistry(dir));
    expect(e.code).toBe('TF_LOCATOR_INVALID');
    expect(e.message).toContain('a.ghost');
  });

  it('validate: within cycles (self, two-step, via fallback)', () => {
    expect(err(() => new LocatorRegistry().register('a.x', { css: 'i', within: 'a.x' }).validate()).message).toMatch(/circular/);
    const two = new LocatorRegistry().register('a.x', { css: 'i', within: 'a.y' }).register('a.y', { css: 'j', within: 'a.x' });
    expect(err(() => two.validate()).code).toBe('TF_LOCATOR_INVALID');
    const viaFb = new LocatorRegistry().register('a.x', { css: 'i', fallbacks: [{ css: 'k', within: 'a.x' }] });
    expect(err(() => viaFb.validate()).message).toMatch(/circular/);
  });

  it('validate: cycle that does not include the start key is also caught', () => {
    const reg = new LocatorRegistry()
      .register('a.s', { css: 's', within: 'a.p' })
      .register('a.p', { css: 'p', within: 'a.q' })
      .register('a.q', { css: 'q', within: 'a.p' });
    expect(err(() => reg.validate()).code).toBe('TF_LOCATOR_INVALID');
  });

  it('validate passes for a valid chain', () => {
    const reg = new LocatorRegistry().register('a.root', '#r').register('a.mid', { css: 'm', within: 'a.root' }).register('a.leaf', { css: 'l', within: 'a.mid' });
    expect(() => reg.validate()).not.toThrow();
  });

  it('loadDirectory on invalid file names file and key', () => {
    const dir = tmpCatalog({ 'checkout.yaml': 'pay:\n  css: a\n  colour: x\n' });
    const e = err(() => LocatorRegistry.fromDir(dir));
    expect(e.message).toContain('checkout.pay');
    expect(e.message).toContain('checkout.yaml');
  });
});

describe('describeDef', () => {
  it('every selector kind', () => {
    expect(describeDef({ role: 'button', name: 'Login' })).toBe("getByRole('button', { name: 'Login' })");
    expect(describeDef({ role: 'heading', level: 2, exact: true })).toBe("getByRole('heading', { level: 2, exact: true })");
    expect(describeDef({ role: 'button' })).toBe("getByRole('button')");
    expect(describeDef({ label: 'Email' })).toBe("getByLabel('Email')");
    expect(describeDef({ label: 'Email', exact: true })).toBe("getByLabel('Email', { exact: true })");
    expect(describeDef({ text: 'Hi' })).toBe("getByText('Hi')");
    expect(describeDef({ testid: 't' })).toBe("getByTestId('t')");
    expect(describeDef({ placeholder: 'p' })).toBe("getByPlaceholder('p')");
    expect(describeDef({ alt: 'a' })).toBe("getByAltText('a')");
    expect(describeDef({ title: 't' })).toBe("getByTitle('t')");
    expect(describeDef({ css: '#a' })).toBe("locator('#a')");
    expect(describeDef({ xpath: '//a' })).toBe("locator('xpath=//a')");
  });

  it('modifiers, within and fallbacks', () => {
    expect(describeDef({ css: 'li', has_text: 'x', nth: 1, first: true, last: true })).toBe("locator('li').filter({ hasText: 'x' }).nth(1).first().last()");
    expect(describeDef({ css: 'li', within: 'a.list' })).toBe("within('a.list').locator('li')");
    expect(describeDef({ role: 'button', name: 'Go', fallbacks: [{ css: '#go' }, { testid: 'go' }] })).toBe(
      "getByRole('button', { name: 'Go' }).or(locator('#go')).or(getByTestId('go'))",
    );
  });

  it('escapes quotes and backslashes', () => {
    expect(describeDef({ text: "it's" })).toBe("getByText('it\\'s')");
    expect(describeDef({ css: 'a\\b' })).toBe("locator('a\\\\b')");
  });
});

describe('LocatorTypeGen', () => {
  it('generateDts output', () => {
    const items = LocatorParser.parseContent('login', 'user: "#u"\nbtn:\n  role: button\n').concat(LocatorParser.parseContent('home', 'hero: "#h"'));
    const dts = LocatorTypeGen.generateDts(items);
    expect(dts).toContain('// Auto-generated by "testfly locators". DO NOT EDIT.');
    expect(dts).toContain('declare global {\n  namespace TestFly {\n    interface LocatorMap {');
    expect(dts).toContain("      'login.user': true;");
    expect(dts).toContain("      'home.hero': true;");
    expect(dts).toContain("export type TestFlyLocatorKey = \n  | 'login.user'\n  | 'login.btn'\n  | 'home.hero';");
    expect(dts).toContain("  'login': {\n    'user': 'login.user';\n    'btn': 'login.btn';\n  };");
    expect(dts).toContain("  'home': {\n    'hero': 'home.hero';\n  };");
    expect(dts.endsWith('}\n')).toBe(true);
  });

  it('empty catalog falls back to string', () => {
    const dts = LocatorTypeGen.generateDts([]);
    expect(dts).toContain('export type TestFlyLocatorKey = \n  | string;');
    expect(dts).toContain('interface LocatorMap {\n    }');
  });

  it('escapes quotes in keys', () => {
    const dts = LocatorTypeGen.generateDts([{ page: 'p', name: "it's", fullKey: "p.it's", definition: { css: 'a' } }]);
    expect(dts).toContain("'p.it\\'s': true;");
  });

  it('generateToFile writes the file, creating directories, and returns count', () => {
    const dir = tmpCatalog({ 'login.yaml': 'username_field:\n  type: label\n  value: "Username"\nlogin_btn:\n  role: button\n', 'dashboard.yaml': 'logout_btn:\n  type: text\n  value: "Çıkış"\n' });
    const out = path.join(dir, 'deep', 'er', 'index.d.ts');
    const res = LocatorTypeGen.generateToFile(dir, out);
    expect(res).toEqual({ count: 3, outputPath: out });
    const content = fs.readFileSync(out, 'utf8');
    expect(content).toContain("'login.username_field'");
    expect(content).toContain("'login.login_btn'");
    expect(content).toContain("'dashboard.logout_btn'");
    expect(content).toContain('export type TestFlyLocatorKey');
  });

  it('generateToFile propagates TF_LOCATOR_INVALID and writes nothing', () => {
    const dir = tmpCatalog({ 'a.yaml': 'x:\n  css: a\n  text: b\n' });
    const out = path.join(dir, 'out', 'index.d.ts');
    expect(err(() => LocatorTypeGen.generateToFile(dir, out)).code).toBe('TF_LOCATOR_INVALID');
    expect(fs.existsSync(out)).toBe(false);
  });
});
