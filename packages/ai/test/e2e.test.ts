import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PROJECT = resolve(__dirname, 'e2e-project');
const CLI = resolve(__dirname, '..', 'node_modules', '@playwright', 'test', 'cli.js');
let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'tf-ai-e2e-'));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

interface Spec {
  title: string;
  tests: { results: { status: string; error?: { message: string }; attachments: { name: string; contentType: string; body?: string }[] }[] }[];
}
function run(env: Record<string, string>, match = '*.pw.ts') {
  const id = Math.random().toString(36).slice(2);
  const jsonOut = join(tmp, `${id}.json`);
  const log = join(tmp, `${id}.llm.jsonl`);
  const cacheDir = join(tmp, `${id}-cache`);
  const proc = spawnSync(process.execPath, [CLI, 'test', '-c', PROJECT], {
    cwd: PROJECT,
    encoding: 'utf8',
    env: { ...process.env, PW_JSON_OUT: jsonOut, FAKE_LLM_LOG: log, AI_CACHE_DIR: cacheDir, PW_MATCH: match, PW_OUTPUT_DIR: join(tmp, `${id}-results`), ...env },
    timeout: 120_000,
  });
  const report = existsSync(jsonOut) ? JSON.parse(readFileSync(jsonOut, 'utf8')) : { suites: [] };
  const specs: Spec[] = [];
  const walk = (s: { specs?: Spec[]; suites?: unknown[] }): void => {
    specs.push(...(s.specs ?? []));
    for (const c of (s.suites ?? []) as { specs?: Spec[]; suites?: unknown[] }[]) walk(c);
  };
  for (const s of report.suites) walk(s);
  const by = (title: string): Spec['tests'][0]['results'][0] => {
    const spec = specs.find((x) => x.title === title);
    if (!spec) throw new Error(`no spec "${title}" in:\n${proc.stdout}\n${proc.stderr}`);
    return spec.tests[0].results[0];
  };
  const llm = existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { system: string; user: string })
    : [];
  return { proc, by, specs, llm, cacheDir };
}

describe('matchers through a real Playwright run (test/expect from @testfly/ai, fake provider)', () => {
  it('live mode: matchers pass/fail with reasons, ai fixture works, AiEvent attachments are emitted', () => {
    const r = run({ AI_MODE: 'live' }, 'matchers.pw.ts');
    const status = Object.fromEntries(r.specs.map((s) => [s.title, s.tests[0].results[0].status]));
    expect(status).toEqual({
      'page toSatisfyAi passes': 'passed',
      'page toViolateAi passes when the model says violated': 'passed',
      'locator scope is sent to the model': 'passed',
      'failing toSatisfyAi message contains the reason': 'passed',
      'failing toViolateAi on locator message': 'passed',
      '.not variants': 'passed',
      'expect.soft records but does not stop': 'failed', // the soft failure is reported at the end
      'ai fixture: act + byIntent + assert': 'passed',
      'no runtime -> TF_AI_NOT_CONFIGURED': 'passed',
    });
    const soft = r.by('expect.soft records but does not stop');
    expect(soft.error?.message).toMatch(/AI verdict: fake-reason-bad/);

    const atts = r.by('page toSatisfyAi passes').attachments;
    const ai = atts.find((a) => a.name === 'testfly-ai-assert');
    expect(ai).toBeDefined();
    const ev = JSON.parse(Buffer.from(ai!.body!, 'base64').toString('utf8'));
    expect(ev).toMatchObject({ feature: 'assert', cache: 'miss', provider: 'fake', model: 'fake-model', inputTokens: 3, outputTokens: 2 });

    const fx = r.by('ai fixture: act + byIntent + assert').attachments.map((a) => a.name);
    expect(fx).toEqual(expect.arrayContaining(['testfly-ai-act', 'testfly-ai-assert']));

    // Locator scoped assertion only sends the locator subtree
    const scoped = r.llm.find((l) => l.user.includes('shows items'));
    expect(scoped?.user).toContain('2 items');
    expect(scoped?.user).not.toContain('heading "Cart"');
  }, 120_000);

  it('replay mode: matchers throw TF_FEATURE_DISABLED (never silently pass) and the LLM is not called', () => {
    const r = run({ AI_MODE: 'replay' }, 'matchers.pw.ts');
    const res = r.by('page toSatisfyAi passes');
    expect(res.status).toBe('failed');
    expect(res.error?.message).toMatch(/AI assertions are not available in ai\.mode="replay"/);
    expect(r.llm).toHaveLength(0);
  }, 120_000);

  it('off mode: TF_FEATURE_DISABLED', () => {
    const r = run({ AI_MODE: 'off' }, 'matchers.pw.ts');
    const res = r.by('page toSatisfyAi passes');
    expect(res.status).toBe('failed');
    expect(res.error?.message).toMatch(/disabled \(ai\.mode = "off"\)/);
    expect(r.llm).toHaveLength(0);
    expect(existsSync(r.cacheDir)).toBe(false);
  }, 120_000);

  it('act() replays from the committed cache in replay mode (second run, same cacheDir)', () => {
    const first = run({ AI_MODE: 'live', AI_CACHE_DIR: join(tmp, 'shared-cache') }, 'matchers.pw.ts');
    expect(first.llm.some((l) => l.system.includes('planner'))).toBe(true);
    const cache = JSON.parse(readFileSync(join(tmp, 'shared-cache', 'action-cache.json'), 'utf8'));
    expect(Object.keys(cache).sort()).toEqual(['blank::intent::go button', 'blank::press the go button']);
    const second = run({ AI_MODE: 'replay', AI_CACHE_DIR: join(tmp, 'shared-cache') }, 'matchers.pw.ts');
    const res = second.by('ai fixture: act + byIntent + assert');
    // act() + byIntent() succeed from cache; the assertion is disabled in replay
    expect(second.llm).toHaveLength(0);
    expect(res.status).toBe('failed');
    expect(res.error?.message).toMatch(/not available in ai\.mode="replay"/);
    expect(res.attachments.find((a) => a.name === 'testfly-ai-act')).toBeDefined();
    const ev = JSON.parse(Buffer.from(res.attachments.find((a) => a.name === 'testfly-ai-act')!.body!, 'base64').toString('utf8'));
    expect(ev.cache).toBe('hit');
  }, 180_000);
});

describe('AiFailureAnalysisReporter in a real run', () => {
  it('analyses a failing test and writes <outputDir>/report/ai-analysis.json', () => {
    const outputDir = join(tmp, 'analysis-out');
    const r = run({ AI_MODE: 'live', AI_REPORTER: '1', AI_REPORTER_PATH: resolve(__dirname, '..', 'src', 'reporter.ts'), AI_OUTPUT_DIR: outputDir }, 'failing.pw.ts');
    expect(r.by('deliberately failing test').status).toBe('failed');
    const file = join(outputDir, 'report', 'ai-analysis.json');
    expect(existsSync(file), `${r.proc.stdout}\n${r.proc.stderr}`).toBe(true);
    const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    const [id, text] = Object.entries(json)[0];
    expect(id).toContain('failing.pw.ts');
    expect(text).toContain('fake analysis');
    expect(r.llm[0].user).toContain('deliberately failing test');
  }, 120_000);
});
