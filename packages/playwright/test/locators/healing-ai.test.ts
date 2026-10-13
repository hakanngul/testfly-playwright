import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { LocatorRegistry } from '../../src/locators/LocatorRegistry';
import { createLocate } from '../../src/locators/createLocate';
import { TestFlyError } from '../../src/core/errors';
import type { HealingStrategy } from '../../src/locators/healing/types';
import { fakeTestInfo, launchChromium, newPage } from '../helpers/locator-env';

const state = vi.hoisted(() => ({
  // importOptional() resolves the package from cwd (CJS entry) before importing it, so mock that exact file too.
  resolved: (() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRequire } = require('node:module') as typeof import('node:module');
    return createRequire(process.cwd() + '/noop.js').resolve('@testfly/ai');
  })(),
  heal: undefined as undefined | ((ctx: any) => Promise<any>),
  calls: [] as string[],
  created: 0,
  aiOptions: undefined as unknown,
}));

const factory = vi.hoisted(() => () => ({
  default: undefined, // importOptional() reads mod.default
  createAiHealingStrategy: (options: unknown): HealingStrategy => {
    state.created++;
    state.aiOptions = options;
    return {
      name: 'ai',
      priority: 100,
      heal: async (ctx) => {
        state.calls.push(ctx.key);
        if (!state.heal) return null;
        return state.heal(ctx);
      },
    };
  },
}));
vi.mock('@testfly/ai', factory);
vi.mock(state.resolved, factory);

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await launchChromium();
});
afterAll(async () => {
  await browser.close();
});
beforeEach(async () => {
  state.heal = undefined;
  state.calls = [];
  state.created = 0;
  page = await newPage(browser, '<button data-testid="login-btn">Go</button><span id="ai-target">ai</span>');
});
afterEach(async () => {
  await page.close();
});

function setup(mode: 'off' | 'rules' | 'ai', defs: Record<string, unknown>, aiOpts: Record<string, unknown> = {}) {
  const reg = new LocatorRegistry();
  for (const [k, v] of Object.entries(defs)) reg.register(k, v);
  const t = fakeTestInfo();
  const locate = createLocate({ page, testInfo: t.info, registry: reg, healing: { mode, failOnHeal: false, fuzzyThreshold: 0.75 }, ai: aiOpts as never });
  return { locate, ...t };
}

describe("healing mode 'ai' (mocked @testfly/ai)", () => {
  it("ai strategy is not even created in 'rules' mode", async () => {
    const { locate } = setup('rules', { 'p.k': '#zzz' });
    await expect(locate.heal('p.k')).rejects.toMatchObject({ code: 'TF_HEALING_FAILED' });
    expect(state.created).toBe(0);
    expect(state.calls).toEqual([]);
  });

  it("is not consulted in 'ai' mode when rules heal first", async () => {
    const { locate, attachments } = setup('ai', { 'login.btn': '#login-btn' });
    const l = await locate.heal('login.btn');
    expect(await l.count()).toBe(1);
    expect(state.calls).toEqual([]);
    expect(JSON.parse(String(attachments[0].body)).strategy).toBe('rules');
  });

  it("is consulted last in 'ai' mode, receives ai options, and its heal is attached", async () => {
    state.heal = async (ctx) => ({ locator: ctx.page.locator('#ai-target'), description: "locator('#ai-target')", confidence: 0.6 });
    const { locate, attachments, info } = setup('ai', { 'p.unfindable': '#zzz' }, { provider: 'openai', mode: 'replay' });
    const l = await locate.heal('p.unfindable');
    expect(await l.getAttribute('id')).toBe('ai-target');
    expect(state.calls).toEqual(['p.unfindable']);
    expect(state.aiOptions).toMatchObject({ provider: 'openai', mode: 'replay' });
    const ev = JSON.parse(String(attachments[0].body));
    expect(ev).toMatchObject({ strategy: 'ai', confidence: 0.6, healed: "locator('#ai-target')" });
    expect(info.annotations[0].type).toBe('healed');
  });

  it('ai returning null -> TF_HEALING_FAILED mentions ai', async () => {
    const { locate } = setup('ai', { 'p.unfindable': '#zzz' });
    const e = await locate.heal('p.unfindable').catch((x) => x);
    expect(e.code).toBe('TF_HEALING_FAILED');
    expect(e.details.tried).toEqual(['rules: no match', 'fuzzy: no match', 'ai: no match']);
  });

  it('TestFlyError from the ai strategy propagates unchanged', async () => {
    const err = new TestFlyError('TF_FEATURE_DISABLED', 'ai is off');
    state.heal = async () => {
      throw err;
    };
    const { locate, attachments } = setup('ai', { 'p.unfindable': '#zzz' });
    await expect(locate.heal('p.unfindable')).rejects.toBe(err);
    expect(attachments).toHaveLength(0);
  });

  it("mode 'off' never consults ai; resolve() in ai mode also reaches the ai strategy", async () => {
    const off = setup('off', { 'p.unfindable': '#zzz' });
    await off.locate.heal('p.unfindable');
    expect(state.calls).toEqual([]);

    state.heal = async (ctx) => ({ locator: ctx.page.locator('#ai-target'), description: 'ai-d', confidence: 0.5 });
    const { locate } = setup('ai', { 'p.unfindable': '#zzz' });
    const l = await locate.resolve('p.unfindable', { timeout: 100 });
    expect(await l.getAttribute('id')).toBe('ai-target');
    expect(state.calls).toEqual(['p.unfindable']);
  });
});
