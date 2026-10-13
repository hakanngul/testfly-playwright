import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { CONTENT_TYPES } from '@testfly/reporter/schema';
import { LocatorRegistry } from '../../src/locators/LocatorRegistry';
import { createLocate } from '../../src/locators/createLocate';
import { RulesStrategy } from '../../src/locators/healing/RulesStrategy';
import { FuzzyStrategy } from '../../src/locators/healing/FuzzyStrategy';
import { registerHealingStrategy, unregisterHealingStrategy, getRegisteredStrategies } from '../../src/locators/healing/registry';
import { buildStrategies, runHealing } from '../../src/locators/healing/runner';
import type { HealContext, HealingStrategy } from '../../src/locators/healing/types';
import { TestFlyError } from '../../src/core/errors';
import { fakeTestInfo, launchChromium, newPage } from '../helpers/locator-env';

let browser: Browser;
const pages: Page[] = [];
beforeAll(async () => {
  browser = await launchChromium();
});
afterAll(async () => {
  await browser.close();
});
afterEach(async () => {
  for (const p of pages.splice(0)) await p.close();
  for (const s of [...getRegisteredStrategies()]) unregisterHealingStrategy(s.name);
});

async function mk(html: string): Promise<Page> {
  const p = await newPage(browser, html);
  pages.push(p);
  return p;
}

const opts = (mode: 'off' | 'rules' | 'ai' = 'rules', fuzzyThreshold = 0.75) => ({ mode, failOnHeal: false, fuzzyThreshold });
const ai = {} as never;

function setup(page: Page, defs: Record<string, unknown>, mode: 'off' | 'rules' | 'ai' = 'rules', threshold = 0.75) {
  const reg = new LocatorRegistry();
  for (const [k, v] of Object.entries(defs)) reg.register(k, v);
  const t = fakeTestInfo();
  const locate = createLocate({ page, testInfo: t.info, registry: reg, healing: opts(mode, threshold), ai });
  return { locate, ...t, reg };
}

const ctxFor = (page: Page, key: string, definition: unknown): HealContext => ({ page, key, original: 'orig', definition, intent: key });

describe('healing off / present', () => {
  it('mode off: heal and resolve return the plain locator without healing', async () => {
    const page = await mk('<button id="renamed">x</button>');
    const { locate, attachments, info } = setup(page, { 'p.b': '#old' }, 'off');
    const h = await locate.heal('p.b');
    expect(await h.count()).toBe(0);
    const r = await locate.resolve('p.b');
    expect(await r.count()).toBe(0);
    expect(attachments).toHaveLength(0);
    expect(info.annotations).toHaveLength(0);
  });

  it('heal() returns the plain locator when the element is present', async () => {
    const page = await mk('<button id="ok">x</button>');
    const { locate, attachments, info } = setup(page, { 'p.b': '#ok' });
    const l = await locate.heal('p.b');
    expect(await l.count()).toBe(1);
    expect(attachments).toHaveLength(0);
    expect(info.annotations).toEqual([]);
  });

  it('plain locate(key) never heals', async () => {
    const page = await mk('<button id="renamed">x</button>');
    const { locate, attachments } = setup(page, { 'p.b': '#old' });
    expect(await locate('p.b').count()).toBe(0);
    expect(attachments).toHaveLength(0);
  });
});

describe('RulesStrategy drift scenarios', () => {
  const cases: Array<{ name: string; html: string; def: unknown; healed: RegExp }> = [
    { name: 'id -> data-testid', html: '<button data-testid="login-btn">Go</button>', def: '#login-btn', healed: /getByTestId\('login-btn'\)/ },
    { name: 'id -> data-test', html: '<button data-test="login-btn">Go</button>', def: '#login-btn', healed: /data-test="login-btn"/ },
    { name: 'id -> name attribute', html: '<input name="email" />', def: '#email', healed: /\[name="email"\]/ },
    { name: 'id with separators removed', html: '<input id="username" />', def: '#user-name', healed: /\[id="username"\]/ },
    { name: 'class partial', html: '<button class="primary-btn-lg">x</button>', def: '.btn.primary-btn', healed: /class\*="primary-btn"/ },
    { name: 'class last of many', html: '<button class="other primary-btn">x</button>', def: '.btn.primary-btn', healed: /\.primary-btn/ },
    { name: 'testid -> other test attr', html: '<button data-qa="pay">x</button>', def: { testid: 'pay' }, healed: /data-qa="pay"/ },
    { name: 'testid -> id', html: '<button id="pay">x</button>', def: { testid: 'pay' }, healed: /#pay/ },
    { name: 'role name exact drift -> text', html: '<button>Sign in now</button>', def: { role: 'button', name: 'Sign in', exact: true }, healed: /getByText\('Sign in'\)/ },
    { name: 'role name -> first significant word', html: '<button>Checkout today</button>', def: { role: 'button', name: 'Checkout cart', exact: true }, healed: /Checkout/ },
    { name: 'label -> aria-label', html: '<input aria-label="Mail" />', def: { label: 'Mail', exact: true }, healed: /aria-label="Mail"|getByLabel/ },
    { name: 'text -> link', html: '<a href="#">Read more here</a>', def: { text: 'Read more', exact: true }, healed: /getByRole\('link'|getByText/ },
    { name: 'placeholder -> aria-label', html: '<input aria-label="Search" />', def: { placeholder: 'Search' }, healed: /getByLabel|aria-label/ },
    { name: 'alt -> title', html: '<img title="Logo" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />', def: { alt: 'Logo' }, healed: /getByTitle|aria-label/ },
    { name: 'title -> text', html: '<span>Close</span>', def: { title: 'Close' }, healed: /getByText\('Close'\)/ },
  ];

  it.each(cases)('$name', async ({ html, def, healed }) => {
    const page = await mk(html);
    const strat = new RulesStrategy();
    const res = await strat.heal({ page, key: 'p.k', original: 'orig', definition: def === 'string' ? def : typeof def === 'string' ? { css: def } : def, intent: 'k' });
    expect(res).not.toBeNull();
    expect(res!.description).toMatch(healed);
    expect(await res!.locator.count()).toBeGreaterThan(0);
    expect(res!.confidence).toBeGreaterThan(0);
    expect(res!.confidence).toBeLessThanOrEqual(0.85);
  });

  it('returns null without a definition or when nothing matches', async () => {
    const page = await mk('<div>nothing</div>');
    expect(await new RulesStrategy().heal(ctxFor(page, 'p.k', undefined))).toBeNull();
    expect(await new RulesStrategy().heal(ctxFor(page, 'p.k', 'string'))).toBeNull();
    expect(await new RulesStrategy().heal(ctxFor(page, 'p.k', { css: '#zzz' }))).toBeNull();
  });

  it('multiple matches: picks first visible with lower confidence', async () => {
    const page = await mk('<button data-testid="x" style="display:none">h</button><button data-testid="x">v</button><button data-testid="x">w</button>');
    const res = await new RulesStrategy().heal(ctxFor(page, 'p.k', { css: '#x' }));
    expect(res).not.toBeNull();
    expect(res!.description).toMatch(/\.nth\(1\)$/);
    expect(res!.confidence).toBeLessThanOrEqual(0.5);
  });

  it('does not re-propose the original selector', async () => {
    const page = await mk('<div class="a">z</div>');
    // original == candidate description would match, but it is excluded via ctx.original
    const res = await new RulesStrategy().heal({ page, key: 'p.k', original: "locator('[class*=\"a\"]')", definition: { css: '.a' }, intent: 'k' });
    // .a (single class) -> only [class*="a"] candidate, which equals original -> skipped
    expect(res).toBeNull();
  });
});

describe('FuzzyStrategy', () => {
  it('heals a renamed button attribute above threshold', async () => {
    const page = await mk('<button data-testid="checkout-button" class="btn">Pay</button><button data-testid="cancel">Cancel</button>');
    const res = await new FuzzyStrategy(0.75).heal(ctxFor(page, 'cart.checkout_button', { testid: 'checkout_button' }));
    expect(res).not.toBeNull();
    expect(res!.description).toBe("getByTestId('checkout-button')");
    expect(res!.confidence).toBeGreaterThanOrEqual(0.75);
    expect(await res!.locator.count()).toBe(1);
  });

  it('heals renamed button text via accessible role/name', async () => {
    const page = await mk('<button>Submit Order</button><button>Cancel</button>');
    const res = await new FuzzyStrategy().heal(ctxFor(page, 'cart.submit', { role: 'button', name: 'Submit_Order', exact: true }));
    expect(res).not.toBeNull();
    expect(res!.description).toContain('Submit Order');
    expect(await res!.locator.textContent()).toBe('Submit Order');
    // a plural drift scores ~0.69: rejected at the default 0.75, accepted at 0.6
    const plural = ctxFor(page, 'cart.x', { role: 'button', name: 'Submit Orders' });
    expect(await new FuzzyStrategy().heal(plural)).toBeNull();
    expect(await new FuzzyStrategy(0.6).heal(plural)).not.toBeNull();
  });

  it('uses the key name as an intent phrase', async () => {
    const page = await mk('<button id="go">Send</button><a href="#" id="forgot-password">Forgot?</a>');
    const res = await new FuzzyStrategy().heal(ctxFor(page, 'login.forgot_password', { css: '#gone' }));
    expect(res).not.toBeNull();
    expect(await res!.locator.getAttribute('id')).toBe('forgot-password');
  });

  it('rejects below threshold', async () => {
    const page = await mk('<button>Totally unrelated</button><a href="#">Elsewhere</a>');
    expect(await new FuzzyStrategy(0.75).heal(ctxFor(page, 'cart.checkout_button', { testid: 'checkout_button' }))).toBeNull();
  });

  it('threshold is honoured: lenient accepts, strict rejects the same candidate', async () => {
    const page = await mk('<button>Place your order now</button>');
    const ctx = ctxFor(page, 'cart.x', { role: 'button', name: 'Place order' });
    expect(await new FuzzyStrategy(0.99).heal(ctx)).toBeNull();
    const lenient = await new FuzzyStrategy(0.4).heal(ctx);
    expect(lenient).not.toBeNull();
    expect(lenient!.confidence).toBeLessThan(0.99);
  });

  it('ignores hidden elements', async () => {
    const page = await mk('<button style="display:none" data-testid="checkout-button">Pay</button>');
    expect(await new FuzzyStrategy().heal(ctxFor(page, 'cart.checkout_button', { testid: 'checkout_button' }))).toBeNull();
  });

  it('role mismatch lowers the score', async () => {
    const page = await mk('<a href="#">Submit Order</a>');
    const asLink = await new FuzzyStrategy(0.5).heal(ctxFor(page, 'p.k', { role: 'link', name: 'Submit Order' }));
    const asButton = await new FuzzyStrategy(0.5).heal(ctxFor(page, 'p.k', { role: 'button', name: 'Submit Order' }));
    expect(asLink!.confidence).toBeGreaterThan(asButton!.confidence);
  });
});

describe('createLocate healing integration', () => {
  it('heal(): rules heal attaches heal event + annotation', async () => {
    const page = await mk('<button data-testid="login-btn">Go</button>');
    const { locate, attachments, info } = setup(page, { 'login.btn': '#login-btn' });
    const l = await locate.heal('login.btn');
    expect(await l.count()).toBe(1);

    expect(attachments).toHaveLength(1);
    expect(attachments[0].name).toBe('testfly-heal');
    expect(attachments[0].contentType).toBe(CONTENT_TYPES.heal);
    const ev = JSON.parse(String(attachments[0].body));
    expect(ev).toMatchObject({ key: 'login.btn', original: "locator('#login-btn')", healed: "getByTestId('login-btn')", strategy: 'rules' });
    expect(ev.confidence).toBeGreaterThan(0);
    expect(ev.confidence).toBeLessThanOrEqual(1);
    expect(ev.url).toBe(page.url());
    expect(typeof ev.timestamp).toBe('number');

    expect(info.annotations).toHaveLength(1);
    expect(info.annotations[0].type).toBe('healed');
    expect(info.annotations[0].description).toBe("login.btn: locator('#login-btn') → getByTestId('login-btn')");
  });

  it('heal(): second call uses the cache (no duplicate events)', async () => {
    const page = await mk('<button data-testid="login-btn">Go</button>');
    const { locate, attachments } = setup(page, { 'login.btn': '#login-btn' });
    await locate.heal('login.btn');
    const again = await locate.heal('login.btn');
    expect(await again.count()).toBe(1);
    expect(attachments).toHaveLength(1);
  });

  it('heal(): fuzzy heals when rules cannot', async () => {
    const page = await mk('<button data-testid="checkout-button">Pay</button>');
    const { locate, attachments } = setup(page, { 'cart.checkout_button': { testid: 'checkout_button' } });
    const l = await locate.heal('cart.checkout_button');
    expect(await l.getAttribute('data-testid')).toBe('checkout-button');
    const ev = JSON.parse(String(attachments[0].body));
    expect(ev.strategy).toBe('fuzzy');
  });

  it('heal(): all fail -> TF_HEALING_FAILED listing strategies, no attachment', async () => {
    const page = await mk('<p>nothing useful</p>');
    const { locate, attachments, info } = setup(page, { 'cart.checkout_button': { testid: 'checkout_button' } });
    const e = await locate.heal('cart.checkout_button').catch((x) => x);
    expect(e).toBeInstanceOf(TestFlyError);
    expect(e.code).toBe('TF_HEALING_FAILED');
    expect(e.message).toContain('cart.checkout_button');
    expect(e.message).toContain('rules: no match');
    expect(e.message).toContain('fuzzy: no match');
    expect(e.details.tried).toEqual(['rules: no match', 'fuzzy: no match']);
    expect(attachments).toHaveLength(0);
    expect(info.annotations).toHaveLength(0);
  });

  it('heal(): unknown key -> TF_LOCATOR_NOT_FOUND', async () => {
    const page = await mk('<p>x</p>');
    const { locate } = setup(page, {});
    await expect(locate.heal('nope.k')).rejects.toMatchObject({ code: 'TF_LOCATOR_NOT_FOUND' });
  });

  it('resolve(): returns immediately when present, waits for late elements without healing', async () => {
    const page = await mk('<p>start</p>');
    const { locate, attachments } = setup(page, { 'p.late': '#late' });
    setTimeout(() => void page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<i id="late">x</i>'); }), 400);
    const t0 = Date.now();
    const l = await locate.resolve('p.late', { timeout: 5000 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(300);
    expect(await l.count()).toBe(1);
    expect(attachments).toHaveLength(0);
  });

  it('resolve(): waits for the timeout and then heals', async () => {
    const page = await mk('<button data-testid="login-btn">Go</button>');
    const { locate, attachments } = setup(page, { 'login.btn': '#login-btn' });
    const t0 = Date.now();
    const l = await locate.resolve('login.btn', { timeout: 600 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(500);
    expect(await l.count()).toBe(1);
    expect(attachments).toHaveLength(1);
  });

  it('resolve(): failing heal throws TF_HEALING_FAILED', async () => {
    const page = await mk('<p>x</p>');
    const { locate } = setup(page, { 'p.zzz': '#zzz' });
    await expect(locate.resolve('p.zzz', { timeout: 100 })).rejects.toMatchObject({ code: 'TF_HEALING_FAILED' });
  });

  it('resolve(): YAML fallback satisfies the wait (no healing event)', async () => {
    const page = await mk('<button id="b2">x</button>');
    const { locate, attachments } = setup(page, { 'p.b': { css: '#b1', fallbacks: ['#b2'] } });
    const l = await locate.resolve('p.b', { timeout: 300 });
    expect(await l.count()).toBe(1);
    expect(attachments).toHaveLength(0);
  });

  it('resolve(): after a heal, later resolve goes through the cache', async () => {
    const page = await mk('<button data-testid="login-btn">Go</button>');
    const { locate, attachments } = setup(page, { 'login.btn': '#login-btn' });
    await locate.resolve('login.btn', { timeout: 100 });
    const t0 = Date.now();
    const l = await locate.resolve('login.btn', { timeout: 5000 });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(await l.count()).toBe(1);
    expect(attachments).toHaveLength(1);
  });
});

describe('strategy ordering and custom strategies', () => {
  const nullStrategy = (name: string, priority: number, log: string[]): HealingStrategy => ({
    name,
    priority,
    heal: async () => {
      log.push(name);
      return null;
    },
  });

  it('built-ins: rules(10) -> fuzzy(20) in rules mode, sorted with custom ones', async () => {
    const log: string[] = [];
    registerHealingStrategy(nullStrategy('late', 50, log));
    registerHealingStrategy(nullStrategy('early', 5, log));
    registerHealingStrategy(nullStrategy('mid', 15, log));
    const list = await buildStrategies(opts('rules'), ai);
    expect(list.map((s) => s.name)).toEqual(['early', 'rules', 'mid', 'fuzzy', 'late']);
  });

  it('runs in priority order and the failure lists them in order', async () => {
    const page = await mk('<p>x</p>');
    const log: string[] = [];
    registerHealingStrategy(nullStrategy('late', 50, log));
    registerHealingStrategy(nullStrategy('early', 5, log));
    const { locate } = setup(page, { 'p.k': '#zzz' });
    const e = await locate.heal('p.k').catch((x) => x);
    expect(e.code).toBe('TF_HEALING_FAILED');
    expect(log).toEqual(['early', 'late']);
    expect(e.details.tried).toEqual(['early: no match', 'rules: no match', 'fuzzy: no match', 'late: no match']);
  });

  it('custom strategy heals and is reported as the strategy; earlier priority wins over rules', async () => {
    const page = await mk('<button id="old-ish" data-testid="login-btn">Go</button><span id="custom">c</span>');
    registerHealingStrategy({
      name: 'custom',
      priority: 1,
      heal: async ({ page: p }) => ({ locator: p.locator('#custom'), description: "locator('#custom')", confidence: 2 }),
    });
    const { locate, attachments } = setup(page, { 'login.btn': '#login-btn' });
    const l = await locate.heal('login.btn');
    expect(await l.getAttribute('id')).toBe('custom');
    const ev = JSON.parse(String(attachments[0].body));
    expect(ev.strategy).toBe('custom');
    expect(ev.confidence).toBe(1); // clamped
  });

  it('registering the same name replaces; unregister removes', async () => {
    const log: string[] = [];
    registerHealingStrategy(nullStrategy('x', 1, log));
    registerHealingStrategy(nullStrategy('x', 2, log));
    expect(getRegisteredStrategies()).toHaveLength(1);
    expect(getRegisteredStrategies()[0].priority).toBe(2);
    expect(unregisterHealingStrategy('x')).toBe(true);
    expect(unregisterHealingStrategy('x')).toBe(false);
    expect(getRegisteredStrategies()).toHaveLength(0);
    const list = await buildStrategies(opts('rules'), ai);
    expect(list.map((s) => s.name)).toEqual(['rules', 'fuzzy']);
  });

  it('a strategy returning a locator with no match is recorded as no match', async () => {
    const page = await mk('<p>x</p>');
    await expect(
      runHealing(ctxFor(page, 'p.k', {}), [{ name: 'liar', priority: 1, heal: async (c) => ({ locator: c.page.locator('#ghost'), description: 'x', confidence: 1 }) }]),
    ).rejects.toMatchObject({ code: 'TF_HEALING_FAILED', details: { tried: ['liar: no match'] } });
  });

  it('a plain Error in a strategy is a miss (first line recorded), TestFlyError propagates', async () => {
    const page = await mk('<p>x</p>');
    const boom: HealingStrategy = { name: 'boom', priority: 1, heal: async () => { throw new Error('kaboom\nsecond line'); } };
    const e = await runHealing(ctxFor(page, 'p.k', {}), [boom]).catch((x) => x);
    expect(e.code).toBe('TF_HEALING_FAILED');
    expect(e.details.tried).toEqual(['boom: kaboom']);
    const strict: HealingStrategy = { name: 'strict', priority: 2, heal: async () => { throw new TestFlyError('TF_FEATURE_DISABLED', 'nope'); } };
    await expect(runHealing(ctxFor(page, 'p.k', {}), [boom, strict])).rejects.toMatchObject({ code: 'TF_FEATURE_DISABLED' });
  });

  it('no strategies at all -> TF_HEALING_FAILED', async () => {
    const page = await mk('<p>x</p>');
    const e = await runHealing(ctxFor(page, 'p.k', {}), []).catch((x) => x);
    expect(e.code).toBe('TF_HEALING_FAILED');
    expect(e.message).toContain('no strategies');
  });

  it('failure hint points to the YAML file and key', async () => {
    const page = await mk('<p>x</p>');
    const e = await runHealing({ page, key: 'login.user.name', original: 'o', intent: '' }, []).catch((x) => x);
    expect(e.hint).toContain('locators/login.yaml');
    expect(e.hint).toContain('user.name');
  });
});
