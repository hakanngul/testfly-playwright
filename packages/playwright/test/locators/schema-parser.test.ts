import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { LocatorParser } from '../../src/locators/LocatorParser';
import { normalizeDef } from '../../src/locators/schema';
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

describe('normalizeDef', () => {
  it.each([
    ['role', { role: 'button', name: 'Login', exact: true }],
    ['label', { label: 'Email', exact: true }],
    ['text', { text: 'Hello' }],
    ['testid', { testid: 'x' }],
    ['placeholder', { placeholder: 'Search' }],
    ['alt', { alt: 'Logo' }],
    ['title', { title: 'Close' }],
    ['css', { css: '#a > .b' }],
    ['xpath', { xpath: '//div' }],
  ])('accepts selector field %s', (_n, raw) => {
    expect(normalizeDef(raw, 'p.k')).toEqual(raw);
  });

  it('string shorthand is css', () => {
    expect(normalizeDef('#submit', 'p.k')).toEqual({ css: '#submit' });
  });

  it('role with level', () => {
    expect(normalizeDef({ role: 'heading', level: 2 }, 'p.k')).toEqual({ role: 'heading', level: 2 });
  });

  it('coerces numbers to strings for text-like fields', () => {
    expect(normalizeDef({ text: 42, has_text: 7 }, 'p.k')).toEqual({ text: '42', has_text: '7' });
  });

  it('modifiers: nth, first, last, has_text, within', () => {
    expect(normalizeDef({ css: 'li', nth: 2, first: true, last: false, has_text: 'x', within: 'p.list' }, 'p.k')).toEqual({
      css: 'li',
      nth: 2,
      first: true,
      last: false,
      has_text: 'x',
      within: 'p.list',
    });
  });

  it('fallbacks: strings and defs', () => {
    const d = normalizeDef({ role: 'button', name: 'Go', fallbacks: ['#go', { testid: 'go' }] }, 'p.k');
    expect(d.fallbacks).toEqual([{ css: '#go' }, { testid: 'go' }]);
  });

  it('legacy type/value form', () => {
    expect(normalizeDef({ type: 'label', value: 'Username' }, 'p.k')).toEqual({ label: 'Username' });
    expect(normalizeDef({ type: 'css', value: '.a' }, 'p.k')).toEqual({ css: '.a' });
    expect(normalizeDef({ type: 'xpath', value: '//a' }, 'p.k')).toEqual({ xpath: '//a' });
    expect(normalizeDef({ type: 'role', role: 'button' }, 'p.k')).toEqual({ role: 'button' });
    expect(normalizeDef({ type: 'role', value: 'button' }, 'p.k')).toEqual({ role: 'button' });
    expect(normalizeDef({ type: 'role', role: 'button', value: 'Save' }, 'p.k')).toEqual({ role: 'button', name: 'Save' });
  });

  it('legacy errors', () => {
    expect(err(() => normalizeDef({ type: 'label' }, 'p.k')).code).toBe('TF_LOCATOR_INVALID');
    expect(err(() => normalizeDef({ value: 'x' }, 'p.k')).message).toMatch(/"value" requires "type"/);
    expect(err(() => normalizeDef({ type: 'bogus', value: 'x' }, 'p.k')).message).toMatch(/unsupported legacy type/);
    expect(err(() => normalizeDef({ type: 'role' }, 'p.k')).message).toMatch(/needs "role" or "value"/);
  });

  it('web: alias merges into the definition; ios/android/mobile become platform definitions', () => {
    expect(normalizeDef({ web: { role: 'button', name: 'A' }, ios: { label: 'Sign In' }, android: 'login_btn' }, 'p.k')).toEqual({
      role: 'button',
      name: 'A',
      platforms: { ios: { label: 'Sign In' }, android: { testid: 'login_btn' } },
    });
    expect(normalizeDef({ web: '#a' }, 'p.k')).toEqual({ css: '#a' });
    expect(normalizeDef({ css: '#a', mobile: { role: 'button', name: 'Go' } }, 'p.k')).toEqual({ css: '#a', platforms: { mobile: { role: 'button', name: 'Go' } } });
    expect(normalizeDef({ web: { css: '#a' }, fallbacks: ['#b'] }, 'p.k').fallbacks).toEqual([{ css: '#b' }]);
    expect(err(() => normalizeDef({ web: 5 }, 'p.k')).code).toBe('TF_LOCATOR_INVALID');
  });

  it('rejects multiple selector fields naming them', () => {
    const e = err(() => normalizeDef({ css: '#a', text: 'b' }, 'login.k', '/x/login.yaml'));
    expect(e.code).toBe('TF_LOCATOR_INVALID');
    expect(e.message).toContain('multiple selector fields');
    expect(e.message).toContain('css');
    expect(e.message).toContain('text');
    expect(e.message).toContain('login.k');
    expect(e.message).toContain('/x/login.yaml');
  });

  it('rejects name/level without role', () => {
    expect(err(() => normalizeDef({ css: '#a', name: 'x' }, 'p.k')).message).toMatch(/only valid together with "role"/);
    expect(err(() => normalizeDef({ text: 'a', level: 1 }, 'p.k')).code).toBe('TF_LOCATOR_INVALID');
  });

  it('rejects unknown fields naming the key', () => {
    const e = err(() => normalizeDef({ css: '#a', colour: 'red' }, 'login.btn', '/c/login.yaml'));
    expect(e.code).toBe('TF_LOCATOR_INVALID');
    expect(e.message).toContain('login.btn');
    expect(e.message).toContain('/c/login.yaml');
    expect(e.message).toContain('colour');
  });

  it('rejects no selector, empty string, bad types, bad level, negative nth', () => {
    expect(err(() => normalizeDef({ nth: 1 }, 'p.k')).message).toMatch(/no selector field/);
    expect(err(() => normalizeDef('  ', 'p.k')).message).toMatch(/empty/);
    expect(err(() => normalizeDef(null, 'p.k')).message).toMatch(/null/);
    expect(err(() => normalizeDef([1], 'p.k')).code).toBe('TF_LOCATOR_INVALID');
    expect(err(() => normalizeDef(5, 'p.k')).message).toMatch(/number/);
    expect(err(() => normalizeDef({ role: 'heading', level: 9 }, 'p.k')).code).toBe('TF_LOCATOR_INVALID');
    expect(err(() => normalizeDef({ css: 'a', nth: -1 }, 'p.k')).code).toBe('TF_LOCATOR_INVALID');
    expect(err(() => normalizeDef({ css: '' }, 'p.k')).code).toBe('TF_LOCATOR_INVALID');
  });

  it('rejects bad fallbacks', () => {
    expect(err(() => normalizeDef({ css: 'a', fallbacks: 'b' }, 'p.k')).message).toMatch(/must be a list/);
    expect(err(() => normalizeDef({ css: 'a', fallbacks: [{ css: 'b', fallbacks: ['c'] }] }, 'p.k')).message).toMatch(/nested fallbacks/);
    expect(err(() => normalizeDef({ css: 'a', fallbacks: [{ foo: 1 }] }, 'p.k')).code).toBe('TF_LOCATOR_INVALID');
  });
});

describe('LocatorParser', () => {
  it('parseContent: names, fullKeys and shorthand', () => {
    const items = LocatorParser.parseContent('login', 'user: "#u"\nbtn:\n  role: button\n  name: Go\n');
    expect(items.map((i) => i.fullKey)).toEqual(['login.user', 'login.btn']);
    expect(items[0]).toMatchObject({ page: 'login', name: 'user', definition: { css: '#u' } });
    expect(items[1].definition).toEqual({ role: 'button', name: 'Go' });
  });

  it('empty content gives []', () => {
    expect(LocatorParser.parseContent('p', '')).toEqual([]);
    expect(LocatorParser.parseContent('p', '# only comment')).toEqual([]);
  });

  it('JSON is accepted', () => {
    expect(LocatorParser.parseContent('p', '{"a":{"css":"#a"}}')[0].definition).toEqual({ css: '#a' });
  });

  it('YAML syntax error -> TF_LOCATOR_INVALID naming the file', () => {
    const e = err(() => LocatorParser.parseContent('p', 'a: [unclosed', '/f/p.yaml'));
    expect(e.code).toBe('TF_LOCATOR_INVALID');
    expect(e.message).toContain('/f/p.yaml');
  });

  it('non-map root -> TF_LOCATOR_INVALID', () => {
    expect(err(() => LocatorParser.parseContent('p', '- a\n- b', '/f/p.yaml')).code).toBe('TF_LOCATOR_INVALID');
    expect(err(() => LocatorParser.parseContent('p', 'just a string')).code).toBe('TF_LOCATOR_INVALID');
  });

  it('invalid entry names file and key', () => {
    const dir = tmpCatalog({ 'login.yaml': 'ok: "#a"\nbad:\n  css: "#a"\n  text: b\n' });
    const e = err(() => LocatorParser.parseFile(path.join(dir, 'login.yaml')));
    expect(e.code).toBe('TF_LOCATOR_INVALID');
    expect(e.message).toContain('login.bad');
    expect(e.message).toContain('login.yaml');
    expect((e.details as { key: string }).key).toBe('login.bad');
  });

  it('parseDirectory: sorted, yaml/yml/json only, non-recursive, missing dir', () => {
    const dir = tmpCatalog({ 'b.yml': 'x: "#x"', 'a.yaml': 'y: "#y"', 'c.json': '{"z":"#z"}', 'readme.md': 'nope', 'd.txt': 'a: b' });
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'e.yaml'), 'q: "#q"');
    const items = LocatorParser.parseDirectory(dir);
    expect(items.map((i) => i.fullKey)).toEqual(['a.y', 'b.x', 'c.z']);
    expect(items[0].file).toBe(path.join(dir, 'a.yaml'));
    expect(LocatorParser.parseDirectory(path.join(dir, 'nope'))).toEqual([]);
    expect(LocatorParser.parseDirectory(path.join(dir, 'a.yaml'))).toEqual([]);
  });
});
