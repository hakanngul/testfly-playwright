import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TestFlyReporter, { TestFlyReporter as Named } from '../src/reporter';
import { CONTENT_TYPES, RunRecordSchema, type RunRecord } from '../src/schema';
import { readHistory } from '../src/history';
import { fakeConfig, fakeResult, fakeTest, fullResult, json, ROOT } from './helpers/fakes';
import { heal } from './helpers/records';
import { useTmpDirs } from './helpers/tmp';

const tmp = useTmpDirs();

let warn: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); log.mockRestore(); });

type Ret = Awaited<ReturnType<TestFlyReporter['onEnd']>>;

async function runSuite(
  outputDir: string,
  build: (r: TestFlyReporter) => void,
  opts: ConstructorParameters<typeof TestFlyReporter>[0] = {},
  config = fakeConfig(),
  end = fullResult('passed'),
): Promise<{ ret: Ret; reporter: TestFlyReporter }> {
  const reporter = new TestFlyReporter({ outputDir, printSummary: false, ...opts });
  reporter.onBegin(config, {} as never);
  build(reporter);
  const ret = await reporter.onEnd(end);
  return { ret, reporter };
}

const latestRun = (outputDir: string): RunRecord => {
  const runs = readHistory(join(outputDir, 'history'));
  return runs[runs.length - 1]!;
};
const byTitle = (run: RunRecord, title: string) => run.tests.find((t) => t.title === title)!;

describe('TestFlyReporter end-to-end with fake Playwright objects', () => {
  it('exports default and named class; does not print to stdio', () => {
    expect(Named).toBe(TestFlyReporter);
    expect(new TestFlyReporter().printsToStdio()).toBe(false);
  });

  it('builds a schema-valid run record covering pass/fail/flaky/skipped/quarantined', async () => {
    const out = tmp();
    const { ret } = await runSuite(out, (r) => {
      const pass = fakeTest({ title: 'passes', outcome: 'expected', tags: ['@smoke'], line: 7 });
      r.onTestEnd(pass, fakeResult({ duration: 50 }));

      const fail = fakeTest({ title: 'fails', describes: ['Suite'], outcome: 'unexpected' });
      r.onTestEnd(fail, fakeResult({ status: 'failed', duration: 20, error: { message: 'expect(locator).toHaveText(expected)\n\nExpected: "a"\nReceived: "b"', stack: 'stack', snippet: 'snip' } }));

      const flaky = fakeTest({ title: 'flaky', outcome: 'flaky' });
      r.onTestEnd(flaky, fakeResult({ retry: 0, status: 'failed', duration: 10, error: { message: 'Timeout 5000ms exceeded.' } }));
      r.onTestEnd(flaky, fakeResult({ retry: 1, status: 'passed', duration: 15 }));

      r.onTestEnd(fakeTest({ title: 'skipped', outcome: 'skipped' }), fakeResult({ status: 'skipped', duration: 0 }));

      const q = fakeTest({ title: 'quarantined', outcome: 'unexpected' });
      r.onTestEnd(q, fakeResult({ status: 'failed', annotations: [{ type: 'quarantine', description: 'JIRA-9' }], error: { message: 'boom' } }));

      const timed = fakeTest({ title: 'timed out', outcome: 'unexpected' });
      r.onTestEnd(timed, fakeResult({ status: 'timedOut', error: { message: 'Test timeout of 30000ms exceeded.' } }));
    }, { env: 'staging' }, fakeConfig({ shard: { current: 2, total: 3 } }), fullResult('failed', 4321));

    expect(ret).toBeUndefined();
    const raw = JSON.parse(readFileSync(join(out, 'history', readdirSync(join(out, 'history'))[0]!), 'utf8'));
    expect(RunRecordSchema.safeParse(raw).success).toBe(true);

    const run = latestRun(out);
    expect(run).toMatchObject({ status: 'failed', durationMs: 4321, env: 'staging', playwrightVersion: '1.64.0', shard: { current: 2, total: 3 } });
    expect(run.totals).toEqual({ total: 6, passed: 2, failed: 2, flaky: 1, skipped: 1, quarantined: 1, healed: 0 });

    const pass = byTitle(run, 'passes');
    expect(pass).toMatchObject({ id: 'chromium::tests/a.spec.ts::passes', file: 'tests/a.spec.ts', line: 7, project: 'chromium', tags: ['@smoke'], status: 'passed', flaky: false, retries: 0, durationMs: 50 });
    expect(pass.error).toBeUndefined();
    expect(pass.triage).toBeUndefined();

    const fail = byTitle(run, 'fails');
    expect(fail).toMatchObject({ status: 'failed', titlePath: ['Suite', 'fails'], id: 'chromium::tests/a.spec.ts::Suite › fails', triage: 'APPLICATION_BUG' });
    expect(fail.error).toMatchObject({ stack: 'stack', snippet: 'snip' });

    const flaky = byTitle(run, 'flaky');
    expect(flaky).toMatchObject({ status: 'passed', flaky: true, retries: 1, durationMs: 25, triage: 'SYSTEM_FLAKY' });
    expect(flaky.error?.message).toContain('Timeout 5000ms');

    expect(byTitle(run, 'skipped').status).toBe('skipped');
    expect(byTitle(run, 'quarantined')).toMatchObject({ quarantined: true, quarantineReason: 'JIRA-9' });
    expect(byTitle(run, 'timed out')).toMatchObject({ status: 'timedOut', triage: 'SYSTEM_FLAKY' });
  });

  it('strips ANSI from error message, stack and snippet', async () => {
    const out = tmp();
    await runSuite(out, (r) => {
      r.onTestEnd(fakeTest({ title: 'ansi', outcome: 'unexpected' }), fakeResult({ status: 'failed', error: { message: '\u001b[31mred\u001b[39m', stack: '\u001b[2mdim\u001b[22m', snippet: '\u001b[32mg\u001b[39m' } }));
    });
    expect(byTitle(latestRun(out), 'ansi').error).toEqual({ message: 'red', stack: 'dim', snippet: 'g' });
  });

  it('writes flakiness.json and summary.json next to the dashboard', async () => {
    const out = tmp();
    await runSuite(out, (r) => {
      r.onTestEnd(fakeTest({ title: 'ok', outcome: 'expected' }), fakeResult());
      r.onTestEnd(fakeTest({ title: 'bad', outcome: 'unexpected' }), fakeResult({ status: 'failed', error: { message: 'x' } }));
    }, {}, fakeConfig(), fullResult('failed'));
    const flak = JSON.parse(readFileSync(join(out, 'report', 'flakiness.json'), 'utf8'));
    expect(flak.map((e: { title: string; risk: string }) => [e.title, e.risk])).toEqual([['bad', 'HIGH'], ['ok', 'STABLE']]);
    const summary = JSON.parse(readFileSync(join(out, 'report', 'summary.json'), 'utf8'));
    expect(summary).toMatchObject({
      status: 'failed', totals: { total: 2, passed: 1, failed: 1 }, passRate: 50,
      gate: { passed: true, violations: [] }, flakiness: { high: 1, watch: 0, stable: 1 }, warnings: 0,
    });
    expect(summary.dashboard).toBe(join(out, 'report', 'index.html'));
    expect(existsSync(join(out, 'report', 'index.html'))).toBe(true);
  });

  it('accumulates history across runs and prunes to historySize; flakiness spans runs', async () => {
    const out = tmp();
    for (let i = 0; i < 4; i++) {
      await runSuite(out, (r) => {
        r.onTestEnd(fakeTest({ title: 't', outcome: i % 2 ? 'unexpected' : 'expected' }), fakeResult({ status: i % 2 ? 'failed' : 'passed', error: i % 2 ? { message: 'x' } : undefined }));
      }, { historySize: 3 });
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(readdirSync(join(out, 'history'))).toHaveLength(3);
    const flak = JSON.parse(readFileSync(join(out, 'report', 'flakiness.json'), 'utf8'));
    expect(flak[0]).toMatchObject({ runs: 3, failures: 2 });
  });

  it('dashboard: false skips index.html; summary.dashboard is absent', async () => {
    const out = tmp();
    await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 't', outcome: 'expected' }), fakeResult()), { dashboard: false });
    expect(existsSync(join(out, 'report', 'index.html'))).toBe(false);
    expect(JSON.parse(readFileSync(join(out, 'report', 'summary.json'), 'utf8')).dashboard).toBeUndefined();
  });

  it('prints a console summary by default and honours printSummary:false', async () => {
    const out = tmp();
    const rep = new TestFlyReporter({ outputDir: out });
    rep.onBegin(fakeConfig(), {} as never);
    rep.onTestEnd(fakeTest({ title: 't', outcome: 'expected' }), fakeResult());
    await rep.onEnd(fullResult());
    expect(log.mock.calls.flat().join('\n')).toContain('1 passed');
    log.mockClear();
    await runSuite(tmp(), (r) => r.onTestEnd(fakeTest({ title: 't', outcome: 'expected' }), fakeResult()));
    expect(log).not.toHaveBeenCalled();
  });

  it('handles an empty run (no tests)', async () => {
    const out = tmp();
    const { ret } = await runSuite(out, () => {});
    expect(ret).toBeUndefined();
    expect(latestRun(out).totals.total).toBe(0);
    expect(existsSync(join(out, 'report', 'index.html'))).toBe(true);
  });

  it('records interrupted global status', async () => {
    const out = tmp();
    await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 'i', outcome: 'unexpected' }), fakeResult({ status: 'interrupted', error: { message: 'x' } })), {}, fakeConfig(), fullResult('interrupted'));
    expect(latestRun(out).status).toBe('interrupted');
    expect(byTitle(latestRun(out), 'i').status).toBe('interrupted');
  });

  it('a global "passed" with failed tests is recorded as failed', async () => {
    const out = tmp();
    await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 'f', outcome: 'unexpected' }), fakeResult({ status: 'failed', error: { message: 'x' } })), {}, fakeConfig(), fullResult('passed'));
    expect(latestRun(out).status).toBe('failed');
  });

  describe('TestFly attachments', () => {
    it('parses single object, array and mixed payloads; keeps steps/api of the last attempt only', async () => {
      const out = tmp();
      const t = fakeTest({ title: 'att', outcome: 'flaky' });
      await runSuite(out, (r) => {
        r.onTestEnd(t, fakeResult({
          retry: 0, status: 'failed', error: { message: 'x' },
          attachments: [{ name: 's', contentType: CONTENT_TYPES.step, body: json({ title: 'attempt-0 step', level: 'info', offsetMs: 1 }) }],
        }));
        r.onTestEnd(t, fakeResult({
          retry: 1,
          attachments: [
            { name: 'heal', contentType: CONTENT_TYPES.heal, body: json(heal()) },
            { name: 'heals', contentType: CONTENT_TYPES.heal, body: json([heal({ key: 'k2' }), heal({ key: 'k3' })]) },
            { name: 'step', contentType: CONTENT_TYPES.step, body: json([{ title: 's1', level: 'pass', offsetMs: 1 }, { title: 's2', level: 'warn', offsetMs: 2 }]) },
            { name: 'api', contentType: CONTENT_TYPES.api, body: json({ method: 'GET', url: 'http://x/y', status: 200, durationMs: 4 }) },
            { name: 'ai', contentType: CONTENT_TYPES.ai, body: json({ feature: 'act', goal: 'g', cache: 'miss', durationMs: 3, inputTokens: 5 }) },
            { name: 'meta', contentType: CONTENT_TYPES.meta, body: json({ analysis: '## Why\nbecause', custom: 1 }) },
            { name: 'other', contentType: 'text/plain', body: Buffer.from('ignored') },
          ],
        }));
      });
      const rec = byTitle(latestRun(out), 'att');
      expect(rec.heals.map((h) => h.key)).toEqual(['login.button', 'k2', 'k3']);
      expect(rec.steps.map((s) => s.title)).toEqual(['s1', 's2']);
      expect(rec.api).toHaveLength(1);
      expect(rec.api[0]).toMatchObject({ status: 200, attempt: 1 });
      expect(rec.ai).toHaveLength(1);
      expect(rec.analysis).toBe('## Why\nbecause');
      expect(latestRun(out).totals.healed).toBe(1);
    });

    it('invalid payloads are skipped with a warning counted in summary.json; valid ones in the same array survive', async () => {
      const out = tmp();
      await runSuite(out, (r) => {
        r.onTestEnd(fakeTest({ title: 'bad', outcome: 'expected' }), fakeResult({
          attachments: [
            { name: 'notjson', contentType: CONTENT_TYPES.heal, body: Buffer.from('{oops') },
            { name: 'wrongshape', contentType: CONTENT_TYPES.heal, body: json({ key: 'only' }) },
            { name: 'mixed', contentType: CONTENT_TYPES.step, body: json([{ title: 'ok', level: 'info', offsetMs: 0 }, { title: 'bad', level: 'nope', offsetMs: 0 }]) },
            { name: 'nobody', contentType: CONTENT_TYPES.api },
          ],
        }));
      });
      const rec = byTitle(latestRun(out), 'bad');
      expect(rec.heals).toEqual([]);
      expect(rec.steps.map((s) => s.title)).toEqual(['ok']);
      const summary = JSON.parse(readFileSync(join(out, 'report', 'summary.json'), 'utf8'));
      expect(summary.warnings).toBe(3);
      const msgs = warn.mock.calls.flat().join('\n');
      expect(msgs).toContain('unreadable "notjson"');
      expect(msgs).toContain('invalid "wrongshape"');
    });

    it('reads attachment bodies from disk via path', async () => {
      const out = tmp();
      const p = join(tmp(), 'heal.json');
      writeFileSync(p, json(heal({ key: 'from-disk' })));
      await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 'disk', outcome: 'expected' }), fakeResult({ attachments: [{ name: 'h', contentType: CONTENT_TYPES.heal, path: p }] })));
      expect(byTitle(latestRun(out), 'disk').heals[0]!.key).toBe('from-disk');
    });

    it('missing attachment file on disk is warned, not thrown', async () => {
      const out = tmp();
      await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 'gone', outcome: 'expected' }), fakeResult({ attachments: [{ name: 'h', contentType: CONTENT_TYPES.heal, path: '/nonexistent/x.json' }] })));
      expect(byTitle(latestRun(out), 'gone').heals).toEqual([]);
      expect(warn.mock.calls.flat().join('\n')).toContain('unreadable "h"');
    });

    it('heals change triage for locator failures', async () => {
      const out = tmp();
      await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 'h', outcome: 'unexpected' }), fakeResult({
        status: 'failed', error: { message: "locator.click: Timeout 1000ms exceeded.\n  - waiting for getByRole('button')" },
        attachments: [{ name: 'h', contentType: CONTENT_TYPES.heal, body: json(heal()) }],
      })));
      expect(byTitle(latestRun(out), 'h').triage).toBe('NEEDS_INVESTIGATION');
    });

    it('collects screenshot/video/trace artifacts relative to outputDir, labelled per retry', async () => {
      const out = tmp();
      const t = fakeTest({ title: 'art', outcome: 'flaky' });
      await runSuite(out, (r) => {
        r.onTestEnd(t, fakeResult({ status: 'failed', error: { message: 'x' }, attachments: [{ name: 'screenshot', contentType: 'image/png', path: join(out, 'shots', 'a.png') }] }));
        r.onTestEnd(t, fakeResult({ retry: 1, attachments: [
          { name: 'video', contentType: 'video/webm', path: '/elsewhere/v.webm' },
          { name: 'trace', contentType: 'application/zip', path: join(out, 'tr.zip') },
          { name: 'log', contentType: 'text/plain', path: '/x/log.txt' },
          { name: 'inline', contentType: 'image/png', body: Buffer.from('x') },
        ] }));
      });
      expect(byTitle(latestRun(out), 'art').artifacts).toEqual([
        { name: 'screenshot', path: 'shots/a.png', contentType: 'image/png' },
        { name: 'video (retry 1)', path: '/elsewhere/v.webm', contentType: 'video/webm' },
        { name: 'trace (retry 1)', path: 'tr.zip', contentType: 'application/zip' },
      ]);
    });
  });

  describe('dashboard embedding', () => {
    it('escapes </script>, <, >, & and U+2028/2029 in the embedded JSON', async () => {
      const out = tmp();
      const evil = 'boom </script><script>window.__pwned=1</script> & <img src=x onerror=1> \u2028 \u2029 end';
      await runSuite(out, (r) => {
        r.onTestEnd(fakeTest({ title: 'evil </script><b>', outcome: 'unexpected' }), fakeResult({ status: 'failed', error: { message: evil, stack: evil } }));
      }, {}, fakeConfig(), fullResult('failed'));
      const html = readFileSync(join(out, 'report', 'index.html'), 'utf8');
      const data = /<script type="application\/json" id="tf-data">([\s\S]*?)<\/script>/.exec(html);
      expect(data).not.toBeNull();
      const body = data![1]!;
      expect(body).not.toContain('<');
      expect(body).not.toContain('>');
      expect(body).not.toContain('&');
      expect(body).not.toContain('\u2028');
      expect(body).not.toContain('\u2029');
      expect(body).toContain('\\u003c/script\\u003e\\u003cscript\\u003e');
      expect(body).toContain('\\u2028');
      // exactly one json script and one code script: the injected tags did not create more
      expect((html.match(/<script/g) ?? []).length).toBe(2);
      const model = JSON.parse(body);
      expect(model.latest.tests[0].error.message).toBe(evil);
      expect(model.latest.tests[0].title).toBe('evil </script><b>');
    });

    it('is self-contained: no external URLs loaded', async () => {
      const out = tmp();
      await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 't', outcome: 'expected' }), fakeResult()));
      const html = readFileSync(join(out, 'report', 'index.html'), 'utf8');
      expect(html).not.toMatch(/<(script|link|img)[^>]+(src|href)=["']https?:/i);
      expect(html).toContain('<title>TestFly Report</title>');
    });
  });

  describe('quality gate', () => {
    it('failing gate returns {status:"failed"} and records violations in summary.json', async () => {
      const out = tmp();
      const { ret } = await runSuite(out, (r) => {
        r.onTestEnd(fakeTest({ title: 'ok', outcome: 'expected' }), fakeResult());
        r.onTestEnd(fakeTest({ title: 'q', outcome: 'unexpected' }), fakeResult({ status: 'failed', error: { message: 'x' } }));
      }, { qualityGate: { minPassRate: 90 } }, fakeConfig(), fullResult('passed'));
      expect(ret).toEqual({ status: 'failed' });
      const summary = JSON.parse(readFileSync(join(out, 'report', 'summary.json'), 'utf8'));
      expect(summary.status).toBe('failed');
      expect(summary.gate.passed).toBe(false);
      expect(summary.gate.violations[0]).toContain('Pass rate 50.0%');
    });

    it('failing gate on an otherwise green run flips the summary status', async () => {
      const out = tmp();
      const { ret } = await runSuite(out, (r) => {
        const t = fakeTest({ title: 'flaky', outcome: 'flaky' });
        r.onTestEnd(t, fakeResult({ status: 'failed', error: { message: 'x' } }));
        r.onTestEnd(t, fakeResult({ retry: 1 }));
      }, { qualityGate: { maxFlaky: 0 } });
      expect(ret).toEqual({ status: 'failed' });
      expect(latestRun(out).status).toBe('passed');
      expect(JSON.parse(readFileSync(join(out, 'report', 'summary.json'), 'utf8')).status).toBe('failed');
    });

    it('passing gate returns undefined', async () => {
      const out = tmp();
      const { ret } = await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 'ok', outcome: 'expected' }), fakeResult()), { qualityGate: { minPassRate: 100, maxFlaky: 0 } });
      expect(ret).toBeUndefined();
    });

    it('failOnHeal gate triggers from heal attachments', async () => {
      const out = tmp();
      const { ret } = await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 'h', outcome: 'expected' }), fakeResult({ attachments: [{ name: 'h', contentType: CONTENT_TYPES.heal, body: json(heal()) }] })), { qualityGate: { failOnHeal: true } });
      expect(ret).toEqual({ status: 'failed' });
    });

    it('failOnHighFlakiness uses history incl. the current run', async () => {
      const out = tmp();
      const failing = (r: TestFlyReporter) => r.onTestEnd(fakeTest({ title: 't', outcome: 'unexpected' }), fakeResult({ status: 'failed', error: { message: 'x' } }));
      const { ret } = await runSuite(out, failing, { qualityGate: { failOnHighFlakiness: true } }, fakeConfig(), fullResult('failed'));
      expect(ret).toEqual({ status: 'failed' });
    });
  });

  describe('resilience (reporter must never throw)', () => {
    it('unwritable outputDir (parent is a file): onEnd resolves undefined and warns', async () => {
      const base = tmp();
      const blocker = join(base, 'blocker');
      writeFileSync(blocker, 'i am a file');
      const rep = new TestFlyReporter({ outputDir: join(blocker, 'sub'), printSummary: false });
      rep.onBegin(fakeConfig(), {} as never);
      rep.onTestEnd(fakeTest({ title: 't', outcome: 'expected' }), fakeResult());
      await expect(rep.onEnd(fullResult())).resolves.toBeUndefined();
      expect(warn.mock.calls.flat().join('\n')).toContain('[testfly] reporter failed');
    });

    it('unwritable outputDir with a failing gate still does not throw', async () => {
      const base = tmp();
      const blocker = join(base, 'blocker');
      writeFileSync(blocker, 'x');
      const rep = new TestFlyReporter({ outputDir: join(blocker, 'sub'), printSummary: false, qualityGate: { minPassRate: 100 } });
      rep.onBegin(fakeConfig(), {} as never);
      rep.onTestEnd(fakeTest({ title: 't', outcome: 'unexpected' }), fakeResult({ status: 'failed', error: { message: 'x' } }));
      await expect(rep.onEnd(fullResult('failed'))).resolves.toBeUndefined();
    });

    it('report dir blocked but history writable: dashboard is not required for history', async () => {
      const out = tmp();
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'report'), 'file blocking report dir');
      const rep = new TestFlyReporter({ outputDir: out, printSummary: false });
      rep.onBegin(fakeConfig(), {} as never);
      rep.onTestEnd(fakeTest({ title: 't', outcome: 'expected' }), fakeResult());
      await expect(rep.onEnd(fullResult())).resolves.toBeUndefined();
      expect(readHistory(join(out, 'history'))).toHaveLength(1);
    });

    it('a test object that throws inside onTestEnd is warned about, not thrown', () => {
      const rep = new TestFlyReporter({ outputDir: tmp(), printSummary: false });
      rep.onBegin(fakeConfig(), {} as never);
      const broken = { title: 'broken', titlePath: () => { throw new Error('nope'); } } as never;
      expect(() => rep.onTestEnd(broken, fakeResult())).not.toThrow();
      expect(warn.mock.calls.flat().join('\n')).toContain('could not record test "broken"');
    });

    it('onEnd without onBegin still works', async () => {
      const out = tmp();
      const rep = new TestFlyReporter({ outputDir: out, printSummary: false });
      await expect(rep.onEnd(fullResult())).resolves.toBeUndefined();
      expect(readHistory(join(out, 'history'))).toHaveLength(1);
    });

    it('error without message uses error.value', async () => {
      const out = tmp();
      await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 'v', outcome: 'unexpected' }), fakeResult({ status: 'failed', error: { value: 'thrown string' } })));
      expect(byTitle(latestRun(out), 'v').error?.message).toBe('thrown string');
    });
  });

  describe('quarantineFile', () => {
    // fakeTest files live under ROOT (/proj); entries match by path suffix, as with the fixture.
    const withQuarantine = (yaml: string | undefined, file = 'testfly-quarantine.yml') => {
      const cfgDir = tmp();
      if (yaml !== undefined) writeFileSync(join(cfgDir, file), yaml);
      return { ...fakeConfig(), configFile: join(cfgDir, 'playwright.config.ts') } as unknown as ReturnType<typeof fakeConfig>;
    };
    const failing = (title: string, extra: Partial<Parameters<typeof fakeTest>[0]> = {}) =>
      [fakeTest({ title, outcome: 'unexpected', ...extra }), fakeResult({ status: 'failed', error: { message: 'boom' } })] as const;

    it('marks tests matched by the quarantine file as quarantined (test, tag and file entries)', async () => {
      const out = tmp();
      const config = withQuarantine(`quarantine:
  - test: "tests/a.spec.ts › Cart › checkout"
    reason: JIRA-1
  - "@flaky-payment"
  - tests/c.spec.ts
`);
      await runSuite(out, (r) => {
        r.onTestEnd(...failing('checkout', { describes: ['Cart'] }));
        r.onTestEnd(...failing('pay', { tags: ['@flaky-payment'] }));
        r.onTestEnd(...failing('whole file', { file: `${ROOT}/tests/c.spec.ts` }));
        r.onTestEnd(...failing('real failure'));
      }, {}, config, fullResult('failed'));
      const run = latestRun(out);
      expect(byTitle(run, 'checkout')).toMatchObject({ quarantined: true, quarantineReason: 'JIRA-1', status: 'failed' });
      expect(byTitle(run, 'pay')).toMatchObject({ quarantined: true });
      expect(byTitle(run, 'pay').quarantineReason).toBeUndefined();
      expect(byTitle(run, 'whole file')).toMatchObject({ quarantined: true });
      expect(byTitle(run, 'real failure')).toMatchObject({ quarantined: false });
      expect(run.totals).toMatchObject({ failed: 1, quarantined: 3 });
      expect(run.status).toBe('failed');
    });

    it('a run whose only failures are quarantined is recorded and returned as passed, and passes the gate', async () => {
      const out = tmp();
      const config = withQuarantine('quarantine:\n  - "tests/a.spec.ts › broken"\n');
      const { ret } = await runSuite(out, (r) => {
        r.onTestEnd(fakeTest({ title: 'ok', outcome: 'expected' }), fakeResult());
        r.onTestEnd(...failing('broken'));
      }, { qualityGate: { minPassRate: 100 } }, config, fullResult('failed'));
      expect(ret).toEqual({ status: 'passed' });
      expect(latestRun(out).status).toBe('passed');
      const summary = JSON.parse(readFileSync(join(out, 'report', 'summary.json'), 'utf8'));
      expect(summary).toMatchObject({ status: 'passed', gate: { passed: true }, totals: { passed: 1, failed: 0, quarantined: 1 } });
    });

    it('does not override the run status when a global error occurred', async () => {
      const out = tmp();
      const config = withQuarantine('quarantine:\n  - "tests/a.spec.ts › broken"\n');
      const { ret } = await runSuite(out, (r) => {
        r.onError({ message: 'globalSetup failed' });
        r.onTestEnd(...failing('broken'));
      }, {}, config, fullResult('failed'));
      expect(ret).toBeUndefined();
      expect(latestRun(out).status).toBe('failed');
    });

    it('the quarantine annotation takes precedence over the file entry', async () => {
      const out = tmp();
      const config = withQuarantine('quarantine:\n  - test: "tests/a.spec.ts › q"\n    reason: from-file\n');
      await runSuite(out, (r) => {
        r.onTestEnd(fakeTest({ title: 'q', outcome: 'skipped' }), fakeResult({ status: 'skipped', annotations: [{ type: 'quarantine', description: 'from-fixture' }] }));
      }, {}, config);
      expect(byTitle(latestRun(out), 'q')).toMatchObject({ quarantined: true, quarantineReason: 'from-fixture' });
    });

    it('honours a custom quarantineFile name; expired entries are ignored', async () => {
      const out = tmp();
      const config = withQuarantine(`quarantine:
  - test: "tests/a.spec.ts › old"
    until: 2000-01-01
  - "tests/a.spec.ts › new"
`, 'q.yml');
      await runSuite(out, (r) => {
        r.onTestEnd(...failing('old'));
        r.onTestEnd(...failing('new'));
      }, { quarantineFile: 'q.yml' }, config, fullResult('failed'));
      const run = latestRun(out);
      expect(byTitle(run, 'old').quarantined).toBe(false);
      expect(byTitle(run, 'new').quarantined).toBe(true);
      expect(warn.mock.calls.flat().join('\n')).toContain('expired quarantine');
    });

    it('a missing quarantine file means no quarantine and no warning', async () => {
      const out = tmp();
      await runSuite(out, (r) => r.onTestEnd(...failing('x')), {}, withQuarantine(undefined), fullResult('failed'));
      expect(byTitle(latestRun(out), 'x').quarantined).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it('an invalid quarantine file is warned about and ignored, never thrown', async () => {
      const out = tmp();
      const { ret } = await runSuite(out, (r) => r.onTestEnd(...failing('x')), {}, withQuarantine('quarantine: 42\n'), fullResult('failed'));
      expect(ret).toBeUndefined();
      expect(byTitle(latestRun(out), 'x').quarantined).toBe(false);
      expect(warn.mock.calls.flat().join('\n')).toContain('TF_QUARANTINE_INVALID');
      const summary = JSON.parse(readFileSync(join(out, 'report', 'summary.json'), 'utf8'));
      expect(summary.warnings).toBe(1);
    });
  });

  it('uses relative file path from config.rootDir and project from the suite', async () => {
    const out = tmp();
    await runSuite(out, (r) => r.onTestEnd(fakeTest({ title: 'x', project: 'webkit', file: `${ROOT}/e2e/deep/b.spec.ts`, outcome: 'expected' }), fakeResult()));
    expect(byTitle(latestRun(out), 'x')).toMatchObject({ file: 'e2e/deep/b.spec.ts', project: 'webkit' });
  });
});
