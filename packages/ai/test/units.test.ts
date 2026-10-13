import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TestFlyError } from '@testfly/playwright';
import { StepExecutionError, executePlan, substitute } from '../src/agent/executor';
import { PageKnowledge, tokens } from '../src/agent/knowledge';
import { ActionPlanSchema, ActionStepSchema, describeTarget, targetLabel, targetToLocator } from '../src/agent/plan';
import type { TargetSpec } from '../src/agent/plan';
import { JsonFileCache } from '../src/cache/json-file-cache';
import type { PageKnowledgeEntry } from '../src/cache/stores';
import { formatPageContext, getPageContext } from '../src/context/page-context';
import { resolveAiOptions } from '../src/options';
import { actUserPrompt, analysisUserPrompt, assertSystemPrompt, healUserPrompt } from '../src/prompts';
import { AiRuntime, extractJson, newUsage } from '../src/runtime';
import { launch } from './helpers/browser';
import { FakeProvider } from './helpers/fake-provider';
import { aiEvents, fakeTestInfo } from './helpers/test-info';

describe('resolveAiOptions', () => {
  it('fills defaults and ignores undefined overrides', () => {
    expect(resolveAiOptions()).toEqual({ provider: 'anthropic', mode: 'live', cacheDir: '.testfly', timeoutMs: 30_000, maxTokens: 1_024, maxContextChars: 24_000, failureAnalysis: false, redact: [] });
    const o = resolveAiOptions({ mode: 'replay', model: undefined, timeoutMs: 5 });
    expect(o.mode).toBe('replay');
    expect(o.timeoutMs).toBe(5);
    expect('model' in o).toBe(false);
  });
});

describe('extractJson', () => {
  it.each([
    ['{"a":1}', { a: 1 }],
    ['  [1,2] ', [1, 2]],
    ['```json\n{"a":1}\n```', { a: 1 }],
    ['```\n{"a":2}\n```', { a: 2 }],
    ['Here you go: {"a":3} hope it helps', { a: 3 }],
    ['Answer:\n[{"x":1}]\nthanks', [{ x: 1 }]],
  ])('%j', (input, expected) => expect(extractJson(input)).toEqual(expected));
  it('throws when there is no JSON', () => {
    expect(() => extractJson('just words')).toThrow(/no JSON/);
    expect(() => extractJson('{broken')).toThrow();
  });
});

describe('AiRuntime', () => {
  const mk = (mode: 'live' | 'replay' | 'off', fake: FakeProvider, extra: Record<string, unknown> = {}) => {
    const info = fakeTestInfo();
    return { info, rt: new AiRuntime(resolveAiOptions({ mode, cacheDir: join(tmpdir(), 'unused-cache'), ...extra }), tmpdir(), info, fake) };
  };

  it('complete(): redacts system and messages, accumulates usage', async () => {
    const fake = new FakeProvider(() => ({ text: 'ok', inputTokens: 7, outputTokens: 3, model: 'm1' }));
    const { rt } = mk('live', fake, { redact: ['hunter\\d'] });
    const usage = newUsage();
    await rt.complete({ system: 'sys hunter1 AKIAIOSFODNN7EXAMPLE', messages: [{ role: 'user', content: 'pw hunter2' }], maxTokens: 10 }, usage);
    await rt.complete({ system: 's', messages: [{ role: 'user', content: 'u' }], maxTokens: 10 }, usage);
    expect(fake.requests[0].system).toBe('sys [REDACTED] [REDACTED:aws-key]');
    expect(fake.requests[0].messages[0].content).toBe('pw [REDACTED]');
    expect(usage).toMatchObject({ calls: 2, inputTokens: 14, outputTokens: 6, provider: 'fake', model: 'm1' });
  });

  it('complete() outside live mode throws TF_AI_CACHE_MISS and never calls the provider', async () => {
    const fake = new FakeProvider(() => 'x');
    for (const mode of ['replay', 'off'] as const) {
      await expect(mk(mode, fake).rt.complete({ system: '', messages: [], maxTokens: 1 })).rejects.toMatchObject({ code: 'TF_AI_CACHE_MISS' });
    }
    expect(fake.calls).toBe(0);
  });

  it('assertEnabled throws TF_FEATURE_DISABLED only for off', () => {
    const fake = new FakeProvider(() => 'x');
    expect(() => mk('off', fake).rt.assertEnabled('act')).toThrowError(/"act" is disabled/);
    expect(() => mk('replay', fake).rt.assertEnabled('act')).not.toThrow();
    expect(() => mk('live', fake).rt.assertEnabled('act')).not.toThrow();
  });

  it('completeJson validates with zod, retries once with the problem, then TF_AI_INVALID_RESPONSE', async () => {
    const schema = z.object({ n: z.number() });
    const fake = new FakeProvider((_r, i) => (i === 0 ? '{"n":"x"}' : '{"n":2}'));
    const { rt } = mk('live', fake);
    expect(await rt.completeJson({ system: 's', user: 'u', schema })).toEqual({ n: 2 });
    expect(fake.requests[1].messages[2].content).toMatch(/invalid/i);
    expect(fake.requests[1].messages[2].content).toMatch(/n/);

    const bad = new FakeProvider(() => 'nope');
    const err = (await mk('live', bad).rt.completeJson({ system: 's', user: 'u', schema }).catch((e: unknown) => e)) as TestFlyError;
    expect(err.code).toBe('TF_AI_INVALID_RESPONSE');
    expect(bad.calls).toBe(2);
    expect(err.details).toBeDefined();
  });

  it('attach(): AiEvent with tokens only when calls happened; never throws when attach fails', async () => {
    const fake = new FakeProvider(() => 'x');
    const { rt, info } = mk('live', fake);
    await rt.attach('act', 'goal', 'hit', Date.now() - 5);
    const usage = { ...newUsage(), calls: 1, inputTokens: 4, outputTokens: 2, provider: 'p', model: 'm' };
    await rt.attach('byIntent', 'g2', 'miss', Date.now(), usage);
    const ev = aiEvents(info);
    expect(ev[0]).toMatchObject({ feature: 'act', goal: 'goal', cache: 'hit' });
    expect(ev[0].inputTokens).toBeUndefined();
    expect(ev[1]).toMatchObject({ feature: 'byIntent', inputTokens: 4, outputTokens: 2, provider: 'p', model: 'm' });
    expect(info.attachments[0].name).toBe('testfly-ai-act');

    const broken = new AiRuntime(resolveAiOptions(), tmpdir(), { attach: async () => Promise.reject(new Error('disk')) } as never, fake);
    await expect(broken.attach('act', 'g', 'miss', Date.now())).resolves.toBeUndefined();
    // no test info at all (outside a test): silently a no-op
    await expect(new AiRuntime(resolveAiOptions(), tmpdir()).attach('act', 'g', 'miss', Date.now())).resolves.toBeUndefined();
  });
});

describe('plan schemas / targets', () => {
  it('ActionStepSchema enforces target and value requirements', () => {
    expect(ActionStepSchema.safeParse({ action: 'click', description: 'd' }).success).toBe(false);
    expect(ActionStepSchema.safeParse({ action: 'fill', target: { label: 'x' }, description: 'd' }).success).toBe(false);
    expect(ActionStepSchema.safeParse({ action: 'navigate', value: '/x', description: 'd' }).success).toBe(true);
    expect(ActionStepSchema.safeParse({ action: 'press', value: 'Enter', description: 'd' }).success).toBe(true);
    expect(ActionStepSchema.safeParse({ action: 'press', description: 'd' }).success).toBe(false);
    expect(ActionStepSchema.safeParse({ action: 'explode', target: { css: 'a' }, description: 'd' }).success).toBe(false);
    expect(ActionStepSchema.safeParse({ action: 'click', target: { css: '' }, description: 'd' }).success).toBe(false);
  });
  it('ActionPlanSchema: 1..30 steps', () => {
    const step = { action: 'click', target: { text: 'x' }, description: 'd' };
    expect(ActionPlanSchema.safeParse({ steps: [] }).success).toBe(false);
    expect(ActionPlanSchema.safeParse({ steps: Array(30).fill(step) }).success).toBe(true);
    expect(ActionPlanSchema.safeParse({ steps: Array(31).fill(step) }).success).toBe(false);
  });
  it('describeTarget / targetLabel cover every variant', () => {
    const cases: [TargetSpec, string, string][] = [
      [{ role: 'button', name: 'Go', exact: true }, 'getByRole("button", { name: "Go", exact: true })', 'Go'],
      [{ role: 'button' }, 'getByRole("button")', 'button'],
      [{ label: 'L' }, 'getByLabel("L")', 'L'],
      [{ text: 'T' }, 'getByText("T")', 'T'],
      [{ testid: 'id' }, 'getByTestId("id")', 'id'],
      [{ placeholder: 'P' }, 'getByPlaceholder("P")', 'P'],
      [{ css: '#a' }, 'locator("#a")', '#a'],
    ];
    for (const [t, d, l] of cases) {
      expect(describeTarget(t)).toBe(d);
      expect(targetLabel(t)).toBe(l);
    }
  });
});

describe('substitute', () => {
  it('replaces placeholders (with whitespace) and throws TF_CONFIG_INVALID for missing params', () => {
    expect(substitute('a {{x}} b {{ y.z }} {{x}}', { x: '1', 'y.z': '2' })).toBe('a 1 b 2 1');
    expect(substitute('no placeholders', {})).toBe('no placeholders');
    expect(substitute('{{x}}', { x: '$& $1' })).toBe('$& $1'); // no regexp replacement-pattern surprises
    expect(() => substitute('{{nope}}', {})).toThrowError(/\{\{nope\}\}/);
  });
});

describe('prompts', () => {
  it('actUserPrompt lists already-done steps only when present', () => {
    expect(actUserPrompt({ goal: 'g', pageContext: 'ctx' })).not.toContain('ALREADY');
    const p = actUserPrompt({ goal: 'g', pageContext: 'ctx', alreadyDone: [{ action: 'click', description: 'did it' }] });
    expect(p).toContain('ALREADY');
    expect(p).toContain('1. did it');
  });
  it('assert system prompt differs by mode', () => {
    expect(assertSystemPrompt('satisfy')).toContain('clearly TRUE');
    expect(assertSystemPrompt('violate')).toContain('VIOLATES');
  });
  it('healUserPrompt / analysisUserPrompt include their inputs', () => {
    expect(healUserPrompt({ key: 'k', original: 'o', intent: 'i', pageContext: 'pc', definition: { a: 1 } })).toMatch(/k[\s\S]*o[\s\S]*i[\s\S]*"a":1[\s\S]*pc/);
    expect(analysisUserPrompt({ title: 'T', error: 'E', steps: [] })).toContain('(none recorded)');
    expect(analysisUserPrompt({ title: 'T', error: 'E', steps: ['s1'], snippet: 'SN', url: 'http://u' })).toMatch(/http:\/\/u[\s\S]*SN[\s\S]*- s1/);
  });
});

describe('PageKnowledge (pure)', () => {
  let dir: string;
  let store: JsonFileCache<PageKnowledgeEntry>;
  let k: PageKnowledge;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tf-ai-k-'));
    store = new JsonFileCache(join(dir, 'k.json'));
    k = new PageKnowledge(store);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('tokens drops stopwords and lowercases', () => {
    expect(tokens('Click the "Sign In" button')).toEqual(['click', 'sign', 'in']);
  });

  it('learn(): synonyms from description + name, merges duplicates, sorted, hover becomes parentTrigger but click-click does not', async () => {
    await k.learn('/p', [
      { action: 'hover', target: { role: 'link', name: 'Products' }, description: 'Hover Products' },
      { action: 'click', target: { role: 'link', name: 'Laptops' }, description: 'Click the Laptops link' },
      { action: 'click', target: { role: 'button', name: 'Buy' }, description: 'Click Buy' },
      { action: 'navigate', value: '/x', description: 'go' },
      { action: 'waitVisible', target: { text: 'x' }, description: 'wait' },
    ]);
    const els = (await store.get('/p'))!.elements;
    expect(els.map((e) => `${e.actionType}:${e.name}`)).toEqual(['click:Buy', 'click:Laptops', 'hover:Products']);
    expect(els.find((e) => e.name === 'Laptops')!.parentTrigger).toEqual({ target: { role: 'link', name: 'Products' }, action: 'hover' });
    expect(els.find((e) => e.name === 'Buy')!.parentTrigger).toBeUndefined();
    expect(els.find((e) => e.name === 'Laptops')!.synonyms).toEqual(['laptops']);

    await k.learn('/p', [{ action: 'click', target: { role: 'link', name: 'Laptops' }, description: 'Open notebook computers' }]);
    const merged = (await store.get('/p'))!.elements.find((e) => e.name === 'Laptops')!;
    expect(merged.synonyms).toEqual(['computers', 'laptops', 'notebook']);
    expect(merged.parentTrigger).toBeDefined(); // kept
  });

  it('resolve(): verb detection, value extraction, ambiguity, unknown page, multi-clause, missing value', async () => {
    await store.set('/p', {
      elements: [
        { name: 'Email', target: { label: 'Email' }, actionType: 'fill', synonyms: ['email', 'address'] },
        { name: 'Sign in', target: { role: 'button', name: 'Sign in' }, actionType: 'click', synonyms: ['sign', 'in', 'login'] },
        { name: 'Terms', target: { label: 'Terms' }, actionType: 'check', synonyms: ['terms'] },
        { name: 'Terms2', target: { label: 'Terms2' }, actionType: 'uncheck', synonyms: ['terms'] },
        { name: 'A', target: { text: 'A' }, actionType: 'click', synonyms: ['dup'] },
        { name: 'B', target: { text: 'B' }, actionType: 'click', synonyms: ['dup'] },
      ],
    });
    expect((await k.resolve('/p', 'type "me@x.io" into the email address field'))![0]).toMatchObject({ action: 'fill', value: 'me@x.io', target: { label: 'Email' } });
    expect((await k.resolve('/p', 'fill {{email}} in email'))![0]).toMatchObject({ value: '{{email}}' });
    expect((await k.resolve('/p', 'tap login'))![0]).toMatchObject({ action: 'click', target: { role: 'button', name: 'Sign in' } });
    expect((await k.resolve('/p', 'tick terms'))![0].action).toBe('check');
    expect((await k.resolve('/p', 'untick terms'))![0].action).toBe('uncheck');
    expect(await k.resolve('/p', 'fill email')).toBeNull(); // no value
    expect(await k.resolve('/p', 'click dup')).toBeNull(); // ambiguous
    expect(await k.resolve('/p', 'click login and then click terms')).toBeNull(); // multi clause
    expect(await k.resolve('/p', 'click login, then logout')).toBeNull();
    expect(await k.resolve('/p', 'click unknownthing')).toBeNull();
    expect(await k.resolve('/other', 'click login')).toBeNull();
    expect(await k.resolve('/p', 'click')).toBeNull(); // no content words
    expect(await k.resolve('/p', 'hover login')).toBeNull(); // wrong action type
  });

  it('resolve() prefers the most specific element (fewest synonyms)', async () => {
    await store.set('/p', {
      elements: [
        { name: 'Save all', target: { text: 'Save all' }, actionType: 'click', synonyms: ['all', 'save'] },
        { name: 'Save', target: { text: 'Save' }, actionType: 'click', synonyms: ['save'] },
      ],
    });
    expect((await k.resolve('/p', 'click save'))![0].target).toEqual({ text: 'Save' });
    expect((await k.resolve('/p', 'click save all'))![0].target).toEqual({ text: 'Save all' });
  });

  it('resolveElement(): by synonyms, ignoring verbs; null when ambiguous', async () => {
    await store.set('/p', {
      elements: [
        { name: 'Email', target: { label: 'Email' }, actionType: 'fill', synonyms: ['email'] },
        { name: 'X', target: { text: 'x' }, actionType: 'click', synonyms: ['same'] },
        { name: 'Y', target: { text: 'y' }, actionType: 'hover', synonyms: ['same'] },
      ],
    });
    expect((await k.resolveElement('/p', 'the email field'))!.name).toBe('Email');
    expect((await k.resolveElement('/p', 'click email'))!.name).toBe('Email');
    expect(await k.resolveElement('/p', 'same')).toBeNull();
    expect(await k.resolveElement('/p', 'the')).toBeNull();
    expect(await k.resolveElement('/zzz', 'email')).toBeNull();
  });
});

describe('browser-backed units', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await launch();
  });
  afterAll(async () => browser.close());
  beforeEach(async () => {
    page = await browser.newPage();
  });
  afterEach(async () => page.close());

  it('targetToLocator resolves each target kind', async () => {
    await page.setContent(`<label for=a>Lab</label><input id=a placeholder="Ph" data-testid="tid"><button>Btn</button><p class=c>Txt</p>`);
    const specs: TargetSpec[] = [{ role: 'button', name: 'Btn' }, { label: 'Lab' }, { text: 'Txt' }, { testid: 'tid' }, { placeholder: 'Ph' }, { css: '.c' }, { role: 'button' }];
    for (const s of specs) expect(await targetToLocator(page, s).count(), JSON.stringify(s)).toBe(1);
  });

  it('executePlan runs each action kind and reports the failing step index', async () => {
    await page.setContent(`<input id=t><select id=s><option>a</option><option>b</option></select><input type=checkbox id=c><button id=b onclick="this.textContent='done'">Go</button>`);
    await executePlan(
      page,
      [
        { action: 'fill', target: { css: '#t' }, value: 'abc', description: 'f' },
        { action: 'clear', target: { css: '#t' }, description: 'c' },
        { action: 'fill', target: { css: '#t' }, value: 'x{{p}}', description: 'f' },
        { action: 'select', target: { css: '#s' }, value: 'b', description: 's' },
        { action: 'check', target: { css: '#c' }, description: 'ck' },
        { action: 'uncheck', target: { css: '#c' }, description: 'uk' },
        { action: 'check', target: { css: '#c' }, description: 'ck' },
        { action: 'hover', target: { css: '#b' }, description: 'h' },
        { action: 'waitVisible', target: { css: '#b' }, description: 'w' },
        { action: 'press', target: { css: '#t' }, value: 'End', description: 'p' },
        { action: 'click', target: { css: '#b' }, description: 'click' },
      ],
      { params: { p: 'Y' }, stepTimeoutMs: 2_000 },
    );
    expect(await page.inputValue('#t')).toBe('xY');
    expect(await page.inputValue('#s')).toBe('b');
    expect(await page.isChecked('#c')).toBe(true);
    expect(await page.innerText('#b')).toBe('done');

    const err = await executePlan(
      page,
      [
        { action: 'click', target: { css: '#b' }, description: 'ok' },
        { action: 'click', target: { css: '#missing' }, description: 'broken step' },
      ],
      { params: {}, stepTimeoutMs: 300 },
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepExecutionError);
    expect((err as StepExecutionError).index).toBe(1);
    expect((err as StepExecutionError).message).toContain('Step 2 ("broken step") failed');
  });

  it('executePlan: TestFlyError (missing param) is NOT wrapped as a stale-plan error', async () => {
    await page.setContent('<input id=t>');
    const err = await executePlan(page, [{ action: 'fill', target: { css: '#t' }, value: '{{pw}}', description: 'f' }], { params: {}, stepTimeoutMs: 300 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TestFlyError);
    expect((err as TestFlyError).code).toBe('TF_CONFIG_INVALID');
  });

  it('getPageContext: page vs locator scope, title, truncation, formatting', async () => {
    await page.setContent(`<title>T1</title><h1>Head</h1><div id=s><button>Inner</button></div>`);
    const full = await getPageContext(page, 10_000);
    expect(full).toMatchObject({ title: 'T1', truncated: false });
    expect(full.snapshot).toContain('heading "Head"');
    const scoped = await getPageContext(page.locator('#s'), 10_000);
    expect(scoped.snapshot).toContain('Inner');
    expect(scoped.snapshot).not.toContain('Head');
    const cut = await getPageContext(page, 10);
    expect(cut.truncated).toBe(true);
    expect(cut.snapshot).toMatch(/…\[truncated\]$/);
    expect(formatPageContext(full)).toMatch(/^URL: .*\nTitle: T1\n\nARIA snapshot:\n/);
  });

  it('getPageContext: masks password values and extra secrets on textbox lines only', async () => {
    await page.setContent(`<input type=password aria-label="Pw"><input aria-label="Token"><input aria-label="Name"><p>Hello hunter2pw</p>`);
    await page.fill('[aria-label=Pw]', 'hunter2pw');
    await page.fill('[aria-label=Token]', 'tok-123456');
    await page.fill('[aria-label=Name]', 'Alice');
    const ctx = await getPageContext(page, 10_000, ['tok-123456']);
    expect(ctx.snapshot).not.toContain('tok-123456');
    expect(ctx.snapshot).toContain('textbox "Pw": [REDACTED:secret]');
    expect(ctx.snapshot).toContain('textbox "Name": Alice'); // ordinary values stay useful
    expect(ctx.snapshot).toContain('Hello hunter2pw'); // non-textbox content untouched
  });

  it('getPageContext: failure to snapshot -> TF_INTERNAL', async () => {
    await page.setContent('<div id=x></div>');
    await expect(getPageContext(page.locator('#nope'), 100)).rejects.toMatchObject({ code: 'TF_INTERNAL' });
  }, 40_000);
});
