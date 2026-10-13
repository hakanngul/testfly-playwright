import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestFlyError } from '@testfly/playwright';
import { TestFlyAgent } from '../src/agent/agent';
import type { ActionCacheEntry } from '../src/cache/stores';
import { resolveAiOptions } from '../src/options';
import { AiRuntime } from '../src/runtime';
import { launch } from './helpers/browser';
import { FakeProvider, plan } from './helpers/fake-provider';
import { LOGIN_HTML } from './helpers/pages';
import { aiEvents, fakeTestInfo } from './helpers/test-info';

let browser: Browser;
let page: Page;
let dir: string;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tf-ai-agent-'));
  page = await browser.newPage();
  await page.route('http://app.test/login', (r) => r.fulfill({ contentType: 'text/html', body: LOGIN_HTML }));
  await reset();
});
const reset = async (): Promise<void> => {
  await page.goto('http://app.test/login');
};
afterEach(async () => {
  await page.close();
  rmSync(dir, { recursive: true, force: true });
});

const LOGIN_PLAN = plan([
  { action: 'fill', target: { label: 'Email' }, value: 'a@b.co', description: 'Fill the email' },
  { action: 'click', target: { role: 'button', name: 'Sign in' }, description: 'Click the Sign in button' },
]);

function setup(mode: 'live' | 'replay' | 'off', fake: FakeProvider, opts: Record<string, unknown> = {}) {
  const info = fakeTestInfo(dir);
  const runtime = new AiRuntime(resolveAiOptions({ mode, ...opts }), dir, info, fake);
  const agent = new TestFlyAgent({ page, runtime, assertFn: async () => undefined });
  return { info, runtime, agent };
}
const actionCache = (): Record<string, ActionCacheEntry> => JSON.parse(readFileSync(join(dir, '.testfly', 'action-cache.json'), 'utf8'));
const out = (): Promise<string> => page.locator('#out').innerText();

describe('act()', () => {
  it('compiles a plan with ONE llm call, executes it, caches it; second call replays from cache without the LLM', async () => {
    const fake = new FakeProvider(() => LOGIN_PLAN);
    const { agent, info } = setup('live', fake);
    await agent.act('log in as a@b.co');
    expect(fake.calls).toBe(1);
    expect(await out()).toBe('signed-in:a@b.co:');
    const cache = actionCache();
    const [key, entry] = Object.entries(cache)[0];
    expect(key).toBe('/login::log in as a@b.co');
    expect(entry.source).toBe('llm');
    expect(entry.model).toBe('fake-model');
    expect(entry.plan).toHaveLength(2);
    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await reset(); // reset page, same URL pattern (about:blank)
    expect(await out()).toBe('idle');
    const second = setup('live', fake);
    await second.agent.act('Log in as  A@B.co');
    expect(fake.calls).toBe(1); // goal normalisation + cache hit
    expect(await out()).toBe('signed-in:a@b.co:');

    const ev1 = aiEvents(info);
    expect(ev1).toHaveLength(1);
    expect(ev1[0]).toMatchObject({ feature: 'act', goal: 'log in as a@b.co', cache: 'miss', provider: 'fake', model: 'fake-model', inputTokens: 10, outputTokens: 5 });
    expect(typeof ev1[0].durationMs).toBe('number');
    const ev2 = aiEvents(second.info);
    expect(ev2[0]).toMatchObject({ feature: 'act', cache: 'hit' });
    expect(ev2[0].inputTokens).toBeUndefined();
    expect(info.attachments[0].contentType).toMatch(/ai/);
  });

  it('sends json mode, temperature 0 and the page context (ARIA snapshot) to the model', async () => {
    const fake = new FakeProvider(() => LOGIN_PLAN);
    await setup('live', fake).agent.act('log in');
    const req = fake.requests[0];
    expect(req.json).toBe(true);
    expect(req.temperature).toBe(0);
    expect(req.messages[0].content).toContain('Goal: log in');
    expect(req.messages[0].content).toContain('button "Sign in"');
    expect(req.messages[0].content).toContain('Title: Login');
  });

  it('replay mode: cache miss -> TF_AI_CACHE_MISS and no LLM call; replay with warm cache works', async () => {
    const fake = new FakeProvider(() => {
      throw new Error('LLM must not be called');
    });
    const { agent, info } = setup('replay', fake);
    const err = await agent.act('log in').catch((e: unknown) => e);
    expect((err as TestFlyError).code).toBe('TF_AI_CACHE_MISS');
    expect(fake.calls).toBe(0);
    expect(aiEvents(info)[0]).toMatchObject({ feature: 'act', cache: 'miss' }); // event still emitted

    // warm the cache in live mode, then replay
    await setup('live', new FakeProvider(() => LOGIN_PLAN)).agent.act('log in');
    await reset();
    await setup('replay', fake).agent.act('log in');
    expect(await out()).toBe('signed-in:a@b.co:');
    expect(fake.calls).toBe(0);
  });

  it('off mode -> TF_FEATURE_DISABLED for act and byIntent; nothing is touched', async () => {
    const fake = new FakeProvider(() => LOGIN_PLAN);
    const { agent } = setup('off', fake);
    for (const p of [agent.act('x'), agent.byIntent('x')]) {
      expect(((await p.catch((e: unknown) => e)) as TestFlyError).code).toBe('TF_FEATURE_DISABLED');
    }
    expect(fake.calls).toBe(0);
    expect(existsSync(join(dir, '.testfly'))).toBe(false);
  });

  it('invalid JSON is retried once (with the validation problem in the prompt), then succeeds', async () => {
    const fake = new FakeProvider((_r, i) => (i === 0 ? 'Sure! here you go: not json' : '```json\n' + LOGIN_PLAN + '\n```'));
    await setup('live', fake).agent.act('log in');
    expect(fake.calls).toBe(2);
    const retry = fake.requests[1].messages;
    expect(retry).toHaveLength(3);
    expect(retry[1]).toEqual({ role: 'assistant', content: 'Sure! here you go: not json' });
    expect(retry[2].content).toMatch(/invalid/i);
    expect(await out()).toBe('signed-in:a@b.co:');
  });

  it('schema-invalid plans (empty steps / missing target) count as invalid; twice -> TF_AI_INVALID_RESPONSE and nothing cached', async () => {
    const fake = new FakeProvider((_r, i) => (i === 0 ? plan([]) : plan([{ action: 'click', description: 'no target' }])));
    const { agent, info } = setup('live', fake);
    const err = (await agent.act('log in').catch((e: unknown) => e)) as TestFlyError;
    expect(err.code).toBe('TF_AI_INVALID_RESPONSE');
    expect(fake.calls).toBe(2);
    expect(existsSync(join(dir, '.testfly', 'action-cache.json'))).toBe(false);
    expect(aiEvents(info)[0]).toMatchObject({ cache: 'miss' });
  });

  it('a freshly compiled plan that cannot execute -> TF_AI_ACTION_FAILED, not cached', async () => {
    const fake = new FakeProvider(() => plan([{ action: 'click', target: { css: '###bad' }, description: 'Click nothing' }]));
    const err = (await setup('live', fake).agent.act('do it').catch((e: unknown) => e)) as TestFlyError;
    expect(err.code).toBe('TF_AI_ACTION_FAILED');
    expect((err.details as { plan: string[] }).plan).toEqual(['Click nothing']);
    expect(existsSync(join(dir, '.testfly', 'action-cache.json'))).toBe(false);
  });

  it('provider failures propagate as-is (no silent fallback)', async () => {
    const fake = new FakeProvider(() => {
      throw new TestFlyError('TF_AI_PROVIDER_ERROR', 'boom');
    });
    const err = (await setup('live', fake).agent.act('log in').catch((e: unknown) => e)) as TestFlyError;
    expect(err.code).toBe('TF_AI_PROVIDER_ERROR');
  });

  it('stale cached plan in live mode: invalidates, recompiles ONLY the remaining steps and stores the merged plan', async () => {
    // seed cache: step 1 works, step 2 targets a removed element
    const seed = new FakeProvider(() => 'unused');
    const { runtime } = setup('live', seed);
    const key = '/login::fill and submit';
    const staleStep = { action: 'click', target: { css: '###gone' }, description: 'Click the old submit' };
    await runtime.caches.actions.set(key, {
      plan: [{ action: 'fill', target: { label: 'Email' }, value: 'a@b.co', description: 'Fill the email' }, staleStep as never],
      source: 'llm',
      createdAt: '2025-01-01',
    });
    await reset();
    const fake = new FakeProvider(() => plan([{ action: 'click', target: { role: 'button', name: 'Sign in' }, description: 'Click Sign in' }]));
    const { agent, info } = setup('live', fake);
    await agent.act('fill and submit');
    expect(fake.calls).toBe(1);
    const prompt = fake.requests[0].messages[0].content;
    expect(prompt).toContain('ALREADY executed');
    expect(prompt).toContain('1. Fill the email');
    expect(prompt).not.toContain('Click the old submit');
    expect(await out()).toBe('signed-in:a@b.co:');
    const merged = actionCache()[key];
    expect(merged.source).toBe('llm');
    expect(merged.plan.map((s) => s.description)).toEqual(['Fill the email', 'Click Sign in']);
    expect(aiEvents(info)[0]).toMatchObject({ cache: 'miss' });
  });

  it('stale cached plan in replay mode -> TF_AI_CACHE_MISS (cache kept, no LLM)', async () => {
    const { runtime } = setup('live', new FakeProvider(() => ''));
    const key = '/login::stale goal';
    await runtime.caches.actions.set(key, { plan: [{ action: 'click', target: { css: '###gone' }, description: 'x' }], source: 'llm', createdAt: '2025-01-01' });
    const fake = new FakeProvider(() => {
      throw new Error('no LLM');
    });
    const err = (await setup('replay', fake).agent.act('stale goal').catch((e: unknown) => e)) as TestFlyError;
    expect(err.code).toBe('TF_AI_CACHE_MISS');
    expect(fake.calls).toBe(0);
    expect(actionCache()[key]).toBeDefined();
  });

  it('stale plan whose element is simply gone waits for the step timeout (realistic) and recompiles from scratch', async () => {
    const { runtime } = setup('live', new FakeProvider(() => ''));
    await runtime.caches.actions.set('/login::login', { plan: [{ action: 'click', target: { role: 'button', name: 'Old Login' }, description: 'Click Old Login' }], source: 'llm', createdAt: '2025-01-01' });
    const fake = new FakeProvider(() => LOGIN_PLAN);
    await setup('live', fake).agent.act('login');
    expect(fake.calls).toBe(1);
    expect(fake.requests[0].messages[0].content).not.toContain('ALREADY executed');
    expect(actionCache()['/login::login'].plan).toHaveLength(2);
  }, 30_000);

  it('{{param}} substitution: the secret never reaches the prompt, the cache or the events; it IS typed into the page', async () => {
    const SECRET = 'Sup3r-S3cret-PW!';
    const fake = new FakeProvider(() =>
      plan([
        { action: 'fill', target: { label: 'Email' }, value: 'a@b.co', description: 'Fill email' },
        { action: 'fill', target: { label: 'Password' }, value: '{{password}}', description: 'Fill password' },
        { action: 'click', target: { role: 'button', name: 'Sign in' }, description: 'Click Sign in' },
      ]),
    );
    const { agent, info } = setup('live', fake);
    await agent.act('log in with password {{password}}', { password: SECRET });
    expect(await out()).toBe(`signed-in:a@b.co:${SECRET}`);
    expect(fake.allText()).not.toContain(SECRET);
    expect(fake.allText()).toContain('{{password}}');
    expect(readFileSync(join(dir, '.testfly', 'action-cache.json'), 'utf8')).not.toContain(SECRET);
    expect(readFileSync(join(dir, '.testfly', 'page-knowledge.json'), 'utf8')).not.toContain(SECRET);
    expect(JSON.stringify(info.attachments)).not.toContain(SECRET);

    // replay uses the new value
    await reset();
    await setup('replay', fake).agent.act('log in with password {{password}}', { password: 'another-pw-1' });
    expect(await out()).toBe('signed-in:a@b.co:another-pw-1');
    expect(fake.calls).toBe(1);
  });

  it('a secret typed by an EARLIER act() does not leak into the prompt of a later act() (page context)', async () => {
    const SECRET = 'Sup3r-S3cret-PW!';
    const fake = new FakeProvider((_r, i) =>
      i === 0 ? plan([{ action: 'fill', target: { label: 'Password' }, value: '{{password}}', description: 'Fill password' }]) : plan([{ action: 'click', target: { role: 'button', name: 'Sign in' }, description: 'Click Sign in' }]),
    );
    const { agent } = setup('live', fake);
    await agent.act('enter the password {{password}}', { password: SECRET });
    await agent.act('submit the form');
    expect(fake.calls).toBe(2);
    expect(fake.requests[1].messages[0].content).not.toContain(SECRET);
  });

  it('missing {{param}} -> TF_CONFIG_INVALID', async () => {
    const fake = new FakeProvider(() => plan([{ action: 'fill', target: { label: 'Password' }, value: '{{pw}}', description: 'Fill' }]));
    const err = (await setup('live', fake).agent.act('type it').catch((e: unknown) => e)) as TestFlyError;
    expect(err.code).toBe('TF_CONFIG_INVALID');
    expect(err.message).toContain('{{pw}}');
  });

  it('redacts configured patterns and env secrets from the page context before the model sees them', async () => {
    await page.setContent(`<button>Pay</button><p>token AKIAIOSFODNN7EXAMPLE and internal-ACME-99</p>`);
    const fake = new FakeProvider(() => plan([{ action: 'click', target: { role: 'button', name: 'Pay' }, description: 'Click Pay' }]));
    await setup('live', fake, { redact: ['internal-ACME-\\d+'] }).agent.act('pay');
    const text = fake.allText();
    expect(text).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(text).not.toContain('internal-ACME-99');
    expect(text).toContain('[REDACTED');
  });

  it('truncates the page context to maxContextChars', async () => {
    await page.setContent(`<button>Pay</button>${'<p>filler text paragraph</p>'.repeat(200)}`);
    const fake = new FakeProvider(() => plan([{ action: 'click', target: { role: 'button', name: 'Pay' }, description: 'Click Pay' }]));
    await setup('live', fake, { maxContextChars: 300 }).agent.act('pay');
    const msg = fake.requests[0].messages[0].content;
    expect(msg).toContain('[truncated]');
    expect(msg.length).toBeLessThan(1_500);
  });

  it('navigate steps resolve against baseUrl; press without target presses the key', async () => {
    await page.route('http://app.test/**', (r) => r.fulfill({ contentType: 'text/html', body: `<input id=i autofocus><script>document.getElementById('i').addEventListener('keydown',e=>document.title=e.key)</script>` }));
    const fake = new FakeProvider(() =>
      plan([
        { action: 'navigate', value: '/home', description: 'Go home' },
        { action: 'click', target: { css: '#i' }, description: 'Focus input' },
        { action: 'press', value: 'Escape', description: 'Press Escape' },
      ]),
    );
    const info = fakeTestInfo(dir);
    const runtime = new AiRuntime(resolveAiOptions({ mode: 'live' }), dir, info, fake);
    const agent = new TestFlyAgent({ page, runtime, baseUrl: 'http://app.test', assertFn: async () => undefined });
    await agent.act('go home and press escape');
    expect(page.url()).toBe('http://app.test/home');
    expect(await page.title()).toBe('Escape');
  });

  it('wraps calls in the provided step function', async () => {
    const titles: string[] = [];
    const info = fakeTestInfo(dir);
    const runtime = new AiRuntime(resolveAiOptions({ mode: 'live' }), dir, info, new FakeProvider(() => LOGIN_PLAN));
    const agent = new TestFlyAgent({
      page,
      runtime,
      assertFn: async () => undefined,
      step: async (title, body) => (titles.push(title), body()),
    });
    await agent.act('log in');
    await agent.assert('cond');
    await agent.byIntent('sign in button');
    expect(titles).toEqual(['ai.act: log in', 'ai.assert: cond', 'ai.byIntent: sign in button']);
  });

  it('assert() delegates to assertFn and propagates its rejection', async () => {
    const info = fakeTestInfo(dir);
    const runtime = new AiRuntime(resolveAiOptions({ mode: 'live' }), dir, info, new FakeProvider(() => ''));
    const seen: string[] = [];
    const agent = new TestFlyAgent({
      page,
      runtime,
      assertFn: async (c) => {
        seen.push(c);
        throw new Error('nope');
      },
    });
    await expect(agent.assert('the thing')).rejects.toThrow('nope');
    expect(seen).toEqual(['the thing']);
  });
});

describe('page knowledge (Auto-POM)', () => {
  it('learns from an LLM plan, then resolves different single-clause goals locally with zero tokens (synonyms)', async () => {
    const fake = new FakeProvider(() => LOGIN_PLAN);
    const { agent } = setup('live', fake);
    await agent.act('log in as a@b.co');
    expect(fake.calls).toBe(1);
    const knowledge = JSON.parse(readFileSync(join(dir, '.testfly', 'page-knowledge.json'), 'utf8'));
    expect(knowledge['/login'].elements.map((e: { name: string }) => e.name).sort()).toEqual(['Email', 'Sign in']);

    await reset();
    const second = setup('live', fake);
    await second.agent.act('Press the Sign in button'); // never compiled before
    expect(fake.calls).toBe(1);
    expect(await out()).toBe('signed-in::');
    expect(aiEvents(second.info)[0]).toMatchObject({ feature: 'act', cache: 'knowledge' });
    expect(actionCache()['/login::press the sign in button'].source).toBe('knowledge');

    await reset();
    await setup('live', fake).agent.act('type "x@y.z" into the email field'); // value extraction
    expect(await page.inputValue('#email')).toBe('x@y.z');
    expect(fake.calls).toBe(1);

    // knowledge also works in replay mode
    await reset();
    await setup('replay', fake).agent.act('click sign in');
    expect(await out()).toBe('signed-in::');
  });

  it('multi-clause goals are left to the LLM', async () => {
    const fake = new FakeProvider(() => LOGIN_PLAN);
    await setup('live', fake).agent.act('log in as a@b.co');
    await reset();
    await setup('live', fake).agent.act('click Sign in and then click Products');
    expect(fake.calls).toBe(2);
  });

  it('parentTrigger (hover) is replayed first: hover the menu, then click the revealed item, no LLM', async () => {
    const fake = new FakeProvider((_r, i) =>
      i === 0
        ? plan([
            { action: 'hover', target: { role: 'link', name: 'Products' }, description: 'Hover Products' },
            { action: 'click', target: { role: 'link', name: 'Laptops' }, description: 'Click Laptops' },
          ])
        : 'unexpected',
    );
    await setup('live', fake).agent.act('open the laptops page from the products menu');
    expect(await out()).toBe('laptops');
    const knowledge = JSON.parse(readFileSync(join(dir, '.testfly', 'page-knowledge.json'), 'utf8'));
    const laptops = knowledge['/login'].elements.find((e: { name: string }) => e.name === 'Laptops');
    expect(laptops.parentTrigger).toEqual({ target: { role: 'link', name: 'Products' }, action: 'hover' });

    await reset();
    const second = setup('live', fake);
    await second.agent.act('click Laptops');
    expect(fake.calls).toBe(1);
    expect(await out()).toBe('laptops');
    expect(aiEvents(second.info)[0]).toMatchObject({ cache: 'knowledge' });
    expect(actionCache()['/login::click laptops'].plan.map((s) => s.action)).toEqual(['hover', 'click']);
  });

  it('ambiguous knowledge (two equally specific matches) falls through to the LLM', async () => {
    const seed = setup('live', new FakeProvider(() => ''));
    await seed.runtime.caches.knowledge.set('/login', {
      elements: [
        { name: 'Save A', target: { text: 'Save' }, actionType: 'click', synonyms: ['save'] },
        { name: 'Save B', target: { css: '#go' }, actionType: 'click', synonyms: ['save'] },
      ],
    });
    const fake = new FakeProvider(() => plan([{ action: 'click', target: { role: 'button', name: 'Sign in' }, description: 'Click Sign in' }]));
    await setup('live', fake).agent.act('click save');
    expect(fake.calls).toBe(1);
  });

  it('stale knowledge in live mode falls through to the LLM; in replay -> TF_AI_CACHE_MISS', async () => {
    const seed = setup('live', new FakeProvider(() => ''));
    await seed.runtime.caches.knowledge.set('/login', { elements: [{ name: 'Ghost', target: { css: '###gone' }, actionType: 'click', synonyms: ['ghost'] }] });
    const fake = new FakeProvider(() => plan([{ action: 'click', target: { role: 'button', name: 'Sign in' }, description: 'Click Sign in' }]));
    await setup('live', fake).agent.act('click ghost');
    expect(fake.calls).toBe(1);

    const quiet = new FakeProvider(() => {
      throw new Error('no LLM');
    });
    await seed.runtime.caches.actions.delete('/login::click ghost');
    await reset();
    const err = (await setup('replay', quiet).agent.act('click ghost').catch((e: unknown) => e)) as TestFlyError;
    expect(err.code).toBe('TF_AI_CACHE_MISS');
  });
});

describe('byIntent()', () => {
  const ANSWER = JSON.stringify({ target: { role: 'button', name: 'Sign in' }, confidence: 0.9, reason: 'obvious' });

  it('returns a plain Playwright Locator, caches it, and replays from cache', async () => {
    const fake = new FakeProvider(() => ANSWER);
    const { agent, info } = setup('live', fake);
    const loc = await agent.byIntent('the login button');
    expect(await loc.innerText()).toBe('Sign in');
    await loc.click();
    expect(await out()).toBe('signed-in::');
    expect(fake.calls).toBe(1);
    expect(aiEvents(info)[0]).toMatchObject({ feature: 'byIntent', cache: 'miss', inputTokens: 10 });
    const key = Object.keys(actionCache())[0];
    expect(key).toBe('/login::intent::the login button');

    const second = setup('live', fake);
    const again = await second.agent.byIntent('The Login   button');
    expect(await again.count()).toBe(1);
    expect(fake.calls).toBe(1);
    expect(aiEvents(second.info)[0]).toMatchObject({ cache: 'hit' });
  });

  it('resolves from learned knowledge without the LLM', async () => {
    const fake = new FakeProvider(() => LOGIN_PLAN);
    await setup('live', fake).agent.act('log in as a@b.co');
    const second = setup('live', fake);
    const loc = await second.agent.byIntent('email field');
    expect(await loc.getAttribute('id')).toBe('email');
    expect(fake.calls).toBe(1);
    expect(aiEvents(second.info)[0]).toMatchObject({ feature: 'byIntent', cache: 'knowledge' });
  });

  it('model suggests a target that matches nothing -> TF_AI_ACTION_FAILED and nothing cached', async () => {
    const fake = new FakeProvider(() => JSON.stringify({ target: { role: 'button', name: 'Nope' } }));
    const err = (await setup('live', fake).agent.byIntent('missing thing').catch((e: unknown) => e)) as TestFlyError;
    expect(err.code).toBe('TF_AI_ACTION_FAILED');
    expect(existsSync(join(dir, '.testfly', 'action-cache.json'))).toBe(false);
  });

  it('replay miss -> TF_AI_CACHE_MISS', async () => {
    const fake = new FakeProvider(() => ANSWER);
    const err = (await setup('replay', fake).agent.byIntent('the login button').catch((e: unknown) => e)) as TestFlyError;
    expect(err.code).toBe('TF_AI_CACHE_MISS');
    expect(fake.calls).toBe(0);
  });

  it('cached target that no longer matches: live recompiles, replay -> TF_AI_CACHE_MISS', async () => {
    const { runtime } = setup('live', new FakeProvider(() => ''));
    await runtime.caches.actions.set('/login::intent::login', { plan: [{ action: 'waitVisible', target: { css: '###gone' }, description: 'login' }], source: 'llm', createdAt: '2025-01-01' });
    const quiet = new FakeProvider(() => 'x');
    expect((((await setup('replay', quiet).agent.byIntent('login').catch((e: unknown) => e)) as TestFlyError).code)).toBe('TF_AI_CACHE_MISS');
    const fake = new FakeProvider(() => ANSWER);
    const loc = await setup('live', fake).agent.byIntent('login');
    expect(await loc.innerText()).toBe('Sign in');
    expect(fake.calls).toBe(1);
  });
});
