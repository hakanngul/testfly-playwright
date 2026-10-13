import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestFlyError } from '@testfly/playwright';
import type { HealContext } from '@testfly/playwright';
import { createAiHealingStrategy, registerProvider } from '../src';
import { launch } from './helpers/browser';
import { FakeProvider } from './helpers/fake-provider';

let browser: Browser;
let page: Page;
let dir: string;
let fake: FakeProvider;
registerProvider('healfake', () => ({ name: 'healfake', complete: (r) => fake.complete(r) }));

beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => browser.close());
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tf-ai-heal-'));
  page = await browser.newPage();
  await page.setContent(`<button>Submit order</button><button>Cancel</button><a href="#x">Dup</a><a href="#y">Dup</a>`);
  fake = new FakeProvider(() => JSON.stringify({ target: { role: 'button', name: 'Submit order' }, confidence: 0.99 }));
});
afterEach(async () => {
  await page.close();
  rmSync(dir, { recursive: true, force: true });
});

const strategy = (mode: 'live' | 'replay' | 'off' = 'live') => createAiHealingStrategy({ provider: 'healfake' as never, mode, cacheDir: dir });
const ctx = (over: Partial<HealContext> = {}): HealContext => ({ page, key: 'checkout.submit', original: "getByRole('button', { name: 'Place order' })", intent: 'checkout submit', ...over });
const healed = (): Record<string, { description: string; target: unknown; confidence: number }> => JSON.parse(readFileSync(join(dir, 'healed-locators.json'), 'utf8'));

describe('createAiHealingStrategy', () => {
  it('has name "ai" and priority 100 (after rules=10 and fuzzy=20)', () => {
    const s = strategy();
    expect(s.name).toBe('ai');
    expect(s.priority).toBe(100);
  });

  it('returns a HealResult for a unique match, clamps confidence to 0.95 and caches in healed-locators.json', async () => {
    const s = strategy();
    const res = await s.heal(ctx({ definition: { role: 'button', name: 'Place order' } }));
    expect(res).not.toBeNull();
    expect(await res!.locator.count()).toBe(1);
    expect(await res!.locator.innerText()).toBe('Submit order');
    expect(res!.confidence).toBe(0.95);
    expect(res!.description).toBe('getByRole("button", { name: "Submit order" })');
    expect(fake.calls).toBe(1);
    const prompt = fake.requests[0].messages[0].content;
    expect(prompt).toContain('checkout.submit');
    expect(prompt).toContain("Place order");
    expect(prompt).toContain('checkout submit');
    expect(prompt).toContain('button "Submit order"');
    expect(prompt).toContain('"role":"button"'); // original definition
    expect(healed()[`checkout.submit::${ctx().original}`]).toEqual({ description: res!.description, target: { role: 'button', name: 'Submit order' }, confidence: 0.95 });
  });

  it('defaults confidence to 0.7 when the model omits it', async () => {
    fake.responder = () => JSON.stringify({ target: { role: 'button', name: 'Cancel' } });
    const res = await strategy().heal(ctx());
    expect(res!.confidence).toBe(0.7);
  });

  it('second heal (fresh strategy) is served from healed-locators.json without the LLM', async () => {
    await strategy().heal(ctx());
    expect(fake.calls).toBe(1);
    const res = await strategy().heal(ctx());
    expect(res).not.toBeNull();
    expect(res!.confidence).toBe(0.95);
    expect(fake.calls).toBe(1);
  });

  it('never guesses: ambiguous (count>1) or missing (count 0) suggestions return null and are not cached', async () => {
    fake.responder = () => JSON.stringify({ target: { role: 'link', name: 'Dup' } });
    expect(await strategy().heal(ctx())).toBeNull();
    fake.responder = () => JSON.stringify({ target: { role: 'button', name: 'Nothing' } });
    expect(await strategy().heal(ctx())).toBeNull();
    expect(existsSync(join(dir, 'healed-locators.json'))).toBe(false);
  });

  it('invalid model output (twice) -> null (no heal), provider errors propagate', async () => {
    fake.responder = () => 'not json';
    expect(await strategy().heal(ctx())).toBeNull();
    expect(fake.calls).toBe(2);
    fake.responder = () => {
      throw new TestFlyError('TF_AI_PROVIDER_ERROR', 'boom');
    };
    await expect(strategy().heal(ctx())).rejects.toMatchObject({ code: 'TF_AI_PROVIDER_ERROR' });
  });

  it('replay mode: miss -> TF_AI_CACHE_MISS without calling the LLM; warm cache works', async () => {
    await expect(strategy('replay').heal(ctx())).rejects.toMatchObject({ code: 'TF_AI_CACHE_MISS' });
    expect(fake.calls).toBe(0);
    await strategy('live').heal(ctx());
    const calls = fake.calls;
    const res = await strategy('replay').heal(ctx());
    expect(await res!.locator.innerText()).toBe('Submit order');
    expect(fake.calls).toBe(calls);
  });

  it('cached heal that no longer matches exactly one element: live re-heals, replay -> TF_AI_CACHE_MISS', async () => {
    await strategy().heal(ctx());
    await page.setContent(`<button>Pay now</button>`);
    await expect(strategy('replay').heal(ctx())).rejects.toMatchObject({ code: 'TF_AI_CACHE_MISS' });
    fake.responder = () => JSON.stringify({ target: { role: 'button', name: 'Pay now' }, confidence: 0.8 });
    const res = await strategy('live').heal(ctx());
    expect(await res!.locator.innerText()).toBe('Pay now');
    expect(healed()[`checkout.submit::${ctx().original}`].target).toEqual({ role: 'button', name: 'Pay now' });
  });

  it('off mode -> TF_FEATURE_DISABLED', async () => {
    await expect(strategy('off').heal(ctx())).rejects.toMatchObject({ code: 'TF_FEATURE_DISABLED' });
  });

  it('different original locators for the same key are cached separately', async () => {
    await strategy().heal(ctx());
    await strategy().heal(ctx({ original: "getByTestId('old-id')" }));
    expect(fake.calls).toBe(2);
    expect(Object.keys(healed())).toHaveLength(2);
  });
});
