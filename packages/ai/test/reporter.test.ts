import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullConfig, FullResult, TestCase, TestResult } from '@playwright/test/reporter';
import { CONTENT_TYPES } from '@testfly/reporter/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerProvider } from '../src';
import AiFailureAnalysisReporter from '../src/reporter';
import type { AiReporterOptions } from '../src/reporter';
import { FakeProvider } from './helpers/fake-provider';

let dir: string;
let fake: FakeProvider;
let logs: string[];
registerProvider('repfake', () => ({ name: 'repfake', complete: (r) => fake.complete(r) }));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tf-ai-rep-'));
  fake = new FakeProvider(() => '**Likely root cause** something');
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const body = (o: unknown): Buffer => Buffer.from(JSON.stringify(o));
function mkTest(name: string, retries = 0): TestCase {
  return {
    retries,
    location: { file: join(dir, 'tests', 'a.spec.ts'), line: 1, column: 1 },
    titlePath: () => ['', 'chromium', 'a.spec.ts', 'suite', name],
    parent: { project: () => ({ name: 'chromium' }) },
  } as unknown as TestCase;
}
function mkResult(over: Partial<TestResult> & { message?: string } = {}): TestResult {
  const { message = 'Error: boom', ...rest } = over;
  return { status: 'failed', retry: 0, errors: [{ message, snippet: 'await expect(x).toBe(1)' }], attachments: [], ...rest } as unknown as TestResult;
}
function mkReporter(opts: AiReporterOptions = {}): AiFailureAnalysisReporter {
  const r = new AiFailureAnalysisReporter({ provider: 'repfake' as never, outputDir: join(dir, 'out'), ...opts });
  r.onBegin({ rootDir: dir } as FullConfig, undefined as never);
  return r;
}
const end = (r: AiFailureAnalysisReporter): Promise<void> => r.onEnd({ status: 'failed' } as FullResult);
const analysisFile = join('out', 'report', 'ai-analysis.json');
const readAnalysis = (): Record<string, string> => JSON.parse(readFileSync(join(dir, analysisFile), 'utf8'));

describe('AiFailureAnalysisReporter', () => {
  it('does not print to stdio', () => {
    expect(mkReporter().printsToStdio()).toBe(false);
  });

  it('writes ai-analysis.json keyed by project::file::title with the model markdown', async () => {
    const r = mkReporter();
    r.onTestEnd(mkTest('does a thing'), mkResult());
    await end(r);
    const json = readAnalysis();
    expect(json).toEqual({ 'chromium::tests/a.spec.ts::suite › does a thing': '**Likely root cause** something' });
    expect(logs.join('\n')).toContain('analysed 1/1');
    expect(fake.requests[0].temperature).toBe(0.2);
    expect(fake.requests[0].maxTokens).toBeGreaterThanOrEqual(1500);
    expect(fake.requests[0].json).toBeFalsy();
  });

  it('prompt has error (ANSI stripped), snippet, last steps and page url from attachments', async () => {
    const steps = Array.from({ length: 20 }, (_, i) => ({ level: 'info', title: `step-${i}` }));
    const r = mkReporter();
    r.onTestEnd(
      mkTest('t'),
      mkResult({
        message: '\u001b[31mError: expected 1\u001b[39m',
        attachments: [
          ...steps.map((s) => ({ name: 'step', contentType: CONTENT_TYPES.step, body: body(s) })),
          { name: 'meta', contentType: CONTENT_TYPES.meta, body: body({ url: 'http://app.test/cart' }) },
          { name: 'broken', contentType: CONTENT_TYPES.step, body: Buffer.from('not json') },
          { name: 'nobody', contentType: CONTENT_TYPES.step },
        ] as never,
      }),
    );
    await end(r);
    const prompt = fake.requests[0].messages[0].content;
    expect(prompt).toContain('Error: expected 1');
    expect(prompt).not.toContain('\u001b');
    expect(prompt).toContain('await expect(x).toBe(1)');
    expect(prompt).toContain('Page URL: http://app.test/cart');
    expect(prompt).toContain('- [info] step-19');
    expect(prompt).not.toContain('step-4\n'); // only the last 15
    expect(prompt).toContain('step-5');
  });

  it('redacts secrets from what is sent and from what is stored', async () => {
    fake.responder = () => 'leaked token Bearer abcdefghijklmnop1234 here';
    const r = mkReporter();
    r.onTestEnd(mkTest('t'), mkResult({ message: 'Error: header Bearer zzzzzzzzzzzzzzzz9999' }));
    await end(r);
    expect(fake.allText()).not.toContain('zzzzzzzzzzzzzzzz9999');
    expect(Object.values(readAnalysis())[0]).not.toContain('abcdefghijklmnop1234');
  });

  it('ignores passed/skipped/interrupted results, non-final retries and results without errors', async () => {
    const r = mkReporter();
    r.onTestEnd(mkTest('passed'), mkResult({ status: 'passed' }));
    r.onTestEnd(mkTest('skipped'), mkResult({ status: 'skipped' }));
    r.onTestEnd(mkTest('first attempt', 2), mkResult({ retry: 0 }));
    r.onTestEnd(mkTest('no error'), mkResult({ errors: [] }));
    await end(r);
    expect(fake.calls).toBe(0);
    expect(existsSync(join(dir, analysisFile))).toBe(false);
    r.onTestEnd(mkTest('final attempt', 2), mkResult({ retry: 2 }));
    r.onTestEnd(mkTest('timed out'), mkResult({ status: 'timedOut' }));
    await end(r);
    expect(Object.keys(readAnalysis())).toHaveLength(2);
  });

  it('maxAnalyses caps the number of calls (default 10)', async () => {
    const r = mkReporter({ maxAnalyses: 3 });
    for (let i = 0; i < 8; i++) r.onTestEnd(mkTest(`t${i}`), mkResult());
    await end(r);
    expect(fake.calls).toBe(3);
    expect(Object.keys(readAnalysis())).toHaveLength(3);
    expect(logs.join('\n')).toContain('analysed 3/8');

    fake = new FakeProvider(() => 'x');
    const d = mkReporter();
    for (let i = 0; i < 14; i++) d.onTestEnd(mkTest(`d${i}`), mkResult());
    await end(d);
    expect(fake.calls).toBe(10);
  });

  it('concurrency limit is respected (and actually used)', async () => {
    fake.responder = async () => {
      await new Promise((r) => setTimeout(r, 40));
      return 'ok';
    };
    const r = mkReporter({ concurrency: 2, maxAnalyses: 20 });
    for (let i = 0; i < 8; i++) r.onTestEnd(mkTest(`t${i}`), mkResult());
    await end(r);
    expect(fake.calls).toBe(8);
    expect(fake.maxInFlight).toBe(2);

    fake = new FakeProvider(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return 'ok';
    });
    const d = mkReporter({ maxAnalyses: 20 });
    for (let i = 0; i < 9; i++) d.onTestEnd(mkTest(`d${i}`), mkResult());
    await end(d);
    expect(fake.maxInFlight).toBe(3); // default
  });

  it('concurrency 0 / negative is clamped to 1', async () => {
    fake.responder = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'ok';
    };
    const r = mkReporter({ concurrency: 0 });
    for (let i = 0; i < 3; i++) r.onTestEnd(mkTest(`t${i}`), mkResult());
    await end(r);
    expect(fake.maxInFlight).toBe(1);
    expect(fake.calls).toBe(3);
  });

  it('never throws: per-item provider failures are logged, the others are still written', async () => {
    fake.responder = (_r, i) => {
      if (i === 1) throw new Error('provider exploded\nsecond line');
      return 'fine';
    };
    const r = mkReporter({ concurrency: 1 });
    for (let i = 0; i < 3; i++) r.onTestEnd(mkTest(`t${i}`), mkResult());
    await expect(end(r)).resolves.toBeUndefined();
    expect(Object.keys(readAnalysis())).toHaveLength(2);
    const out = logs.join('\n');
    expect(out).toContain('analysis failed for');
    expect(out).toContain('provider exploded');
    expect(out).not.toContain('second line');
  });

  it('never throws when every call fails (no file written) or the provider is not configured', async () => {
    fake.responder = () => {
      throw new Error('down');
    };
    const r = mkReporter();
    r.onTestEnd(mkTest('t'), mkResult());
    await expect(end(r)).resolves.toBeUndefined();
    expect(existsSync(join(dir, analysisFile))).toBe(false);

    const saved = { ...process.env };
    for (const k of ['ANTHROPIC_API_KEY', 'TESTFLY_AI_API_KEY']) delete process.env[k];
    try {
      const unconfigured = new AiFailureAnalysisReporter({ provider: 'anthropic', outputDir: join(dir, 'out2') });
      unconfigured.onBegin({ rootDir: dir } as FullConfig, undefined as never);
      unconfigured.onTestEnd(mkTest('t'), mkResult());
      await expect(end(unconfigured)).resolves.toBeUndefined();
      expect(logs.join('\n')).toContain('TF_AI_NOT_CONFIGURED');
      expect(existsSync(join(dir, 'out2'))).toBe(false);
    } finally {
      Object.assign(process.env, saved);
    }
  });

  it('never throws when the output cannot be written (outputDir is a file)', async () => {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'blocker'), 'x');
    const r = mkReporter({ outputDir: join(dir, 'blocker', 'nested') });
    r.onTestEnd(mkTest('t'), mkResult());
    await expect(end(r)).resolves.toBeUndefined();
    expect(logs.join('\n')).toContain('failure analysis skipped');
  });

  it.each(['replay', 'off'] as const)('mode %s prints one line and does nothing', async (mode) => {
    const r = mkReporter({ mode });
    r.onTestEnd(mkTest('t'), mkResult());
    await end(r);
    expect(fake.calls).toBe(0);
    expect(logs).toEqual([`[testfly-ai] failure analysis skipped (ai.mode = "${mode}").`]);
    expect(existsSync(join(dir, 'out'))).toBe(false);
  });

  it('silent with no failures', async () => {
    const r = mkReporter();
    await end(r);
    expect(logs).toEqual([]);
    expect(fake.calls).toBe(0);
  });
});
