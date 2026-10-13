import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { LocatorRegistry } from '../../src/locators/LocatorRegistry';
import { createLocate } from '../../src/locators/createLocate';
import { TestFlyError } from '../../src/core/errors';
import { fakeTestInfo, launchChromium, newPage } from '../helpers/locator-env';

const HTML = `
<form id="login" class="frm">
  <label for="email">Email</label><input id="email" placeholder="you@x.com" />
  <input data-testid="pwd" type="password" aria-label="Password" />
  <button type="submit" title="Send it">Log in</button>
</form>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Company logo" />
<h2>Section</h2><h3>Sub</h3>
<ul id="items"><li>Apple</li><li>Banana</li><li>Cherry</li></ul>
<div id="a"><button>Go</button></div>
<div id="b"><button>Go</button></div>
<p>Hello world</p>
`;

describe('locate() resolves each selector type (real chromium)', () => {
  let browser: Browser;
  let page: Page;
  const reg = new LocatorRegistry()
    .register('p.role', { role: 'button', name: 'Log in' })
    .register('p.role_exact_miss', { role: 'button', name: 'Log', exact: true })
    .register('p.heading', { role: 'heading', level: 3 })
    .register('p.label', { label: 'Email' })
    .register('p.text', { text: 'Hello world' })
    .register('p.text_exact_miss', { text: 'Hello', exact: true })
    .register('p.testid', { testid: 'pwd' })
    .register('p.placeholder', { placeholder: 'you@x.com' })
    .register('p.alt', { alt: 'Company logo' })
    .register('p.title', { title: 'Send it' })
    .register('p.css', { css: 'form#login .frm, form.frm' })
    .register('p.short', '#email')
    .register('p.xpath', { xpath: '//ul/li[2]' })
    .register('p.nth', { css: '#items li', nth: 2 })
    .register('p.first', { css: '#items li', first: true })
    .register('p.last', { css: '#items li', last: true })
    .register('p.has_text', { css: '#items li', has_text: 'Banan' })
    .register('p.container_a', '#a')
    .register('p.go_in_a', { role: 'button', name: 'Go', within: 'p.container_a' })
    .register('p.go_any', { role: 'button', name: 'Go' })
    .register('p.missing_primary', { css: '#nope', fallbacks: ['#email'] })
    .register('p.fb_def', { role: 'button', name: 'Nope', fallbacks: [{ testid: 'pwd' }, '#email'] })
    .register('p.fb_within', { css: '#nope', fallbacks: [{ role: 'button', name: 'Go', within: 'p.container_a' }] })
    .register('p.both_present', { css: '#items li', fallbacks: ['#email', '#items li:last-child'] })
    .register('p.cycle_a', { css: 'x', within: 'p.cycle_b' })
    .register('p.cycle_b', { css: 'y', within: 'p.cycle_a' })
    .register('p.dangling', { css: 'x', within: 'p.ghost' });

  beforeAll(async () => {
    browser = await launchChromium();
    page = await newPage(browser, HTML);
  });
  afterAll(async () => {
    await browser.close();
  });

  const locate = () => createLocate({ page, testInfo: fakeTestInfo().info, registry: reg, healing: { mode: 'off', failOnHeal: false, fuzzyThreshold: 0.75 }, ai: {} as never });

  it.each([
    ['p.role', 1, 'Log in'],
    ['p.heading', 1, 'Sub'],
    ['p.label', 1, null],
    ['p.text', 1, 'Hello world'],
    ['p.testid', 1, null],
    ['p.placeholder', 1, null],
    ['p.alt', 1, null],
    ['p.title', 1, 'Log in'],
    ['p.css', 1, null],
    ['p.short', 1, null],
    ['p.xpath', 1, 'Banana'],
    ['p.nth', 1, 'Cherry'],
    ['p.first', 1, 'Apple'],
    ['p.last', 1, 'Cherry'],
    ['p.has_text', 1, 'Banana'],
  ])('%s -> %i element', async (key, count, text) => {
    const l = locate()(key);
    expect(await l.count()).toBe(count);
    if (text) expect((await l.textContent())?.trim()).toBe(text);
  });

  it('exact modifier makes substring selectors miss', async () => {
    expect(await locate()('p.role_exact_miss').count()).toBe(0);
    expect(await locate()('p.text_exact_miss').count()).toBe(0);
  });

  it('within scopes the chain', async () => {
    expect(await locate()('p.go_any').count()).toBe(2);
    const scoped = locate()('p.go_in_a');
    expect(await scoped.count()).toBe(1);
    expect(await scoped.evaluate((el) => el.parentElement?.id)).toBe('a');
  });

  it('fallback is used when the primary is missing', async () => {
    const l = locate();
    const viaStr = l('p.missing_primary');
    expect(await viaStr.count()).toBe(1);
    expect(await viaStr.getAttribute('id')).toBe('email');
    const viaDef = l('p.fb_def');
    expect(await viaDef.count()).toBe(1);
    // both fallbacks match; .or() yields DOM order, so the earlier element (#email) wins
    expect(await viaDef.getAttribute('id')).toBe('email');
    const viaWithin = l('p.fb_within');
    expect(await viaWithin.count()).toBe(1);
    expect(await viaWithin.evaluate((el) => el.parentElement?.id)).toBe('a');
  });

  it('fallback chain collapses to a single element (no strict-mode violation)', async () => {
    const l = locate()('p.both_present');
    expect(await l.count()).toBe(1);
    await expect(l.getAttribute('id')).resolves.toBe('email'); // DOM-first among all alternatives
  });

  it('circular within is reported at build time, unknown within -> NOT_FOUND', () => {
    const l = locate();
    try {
      l('p.cycle_a');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(TestFlyError);
      expect((e as TestFlyError).code).toBe('TF_LOCATOR_INVALID');
      expect((e as TestFlyError).message).toContain('Circular');
    }
    try {
      l('p.dangling');
      throw new Error('expected throw');
    } catch (e) {
      expect((e as TestFlyError).code).toBe('TF_LOCATOR_NOT_FOUND');
    }
  });

  it('unknown key throws TF_LOCATOR_NOT_FOUND', () => {
    try {
      locate()('p.zzz');
      throw new Error('expected throw');
    } catch (e) {
      expect((e as TestFlyError).code).toBe('TF_LOCATOR_NOT_FOUND');
    }
  });

  it('registry.resolve builds the same plain locator', async () => {
    expect(await reg.resolve(page, 'p.label').count()).toBe(1);
  });
});
