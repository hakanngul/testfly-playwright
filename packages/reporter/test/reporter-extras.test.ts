import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import TestFlyReporter, { type TestFlyReporterOptions } from '../src/reporter';
import { embedAnalysis, readAnalysisFile } from '../src/analysis';
import { notifyRun } from '../src/notifications';
import { CONTENT_TYPES, type RunRecord } from '../src/schema';
import { readHistory } from '../src/history';
import { fakeConfig, fakeResult, fakeTest, fullResult, json } from './helpers/fakes';
import { heal } from './helpers/records';
import { useTmpDirs } from './helpers/tmp';

const tmp = useTmpDirs();
let warn: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  log.mockRestore();
});

const FAILED_ID = 'chromium::tests/a.spec.ts::fails';

async function run(outputDir: string, opts: TestFlyReporterOptions = {}, beforeEnd?: () => void): Promise<RunRecord> {
  const r = new TestFlyReporter({ outputDir, printSummary: false, ...opts });
  r.onBegin(fakeConfig(), {} as never);
  r.onTestEnd(
    fakeTest({ title: 'passes', outcome: 'expected' }),
    fakeResult({ attachments: [{ name: 'testfly-heal', contentType: CONTENT_TYPES.heal, body: json([heal({ key: 'login.submit', strategy: 'rules' }), heal({ key: 'login.user', strategy: 'fuzzy' })]) }] }),
  );
  r.onTestEnd(
    fakeTest({ title: 'fails', outcome: 'unexpected' }),
    fakeResult({
      status: 'failed',
      error: { message: 'boom' },
      attachments: [{ name: 'testfly-console', contentType: CONTENT_TYPES.console, body: json([{ type: 'pageerror', message: 'kaboom', timestamp: 1 }]) }],
    }),
  );
  beforeEnd?.();
  await r.onEnd(fullResult('failed'));
  const runs = readHistory(join(outputDir, 'history'));
  return runs[runs.length - 1]!;
}

describe('heal log', () => {
  it('writes every heal of the run (all strategies) to report/heal-log.json', async () => {
    const out = tmp();
    await run(out);
    const log = JSON.parse(readFileSync(join(out, 'report', 'heal-log.json'), 'utf8'));
    expect(log).toHaveLength(2);
    expect(log.map((e: { strategy: string }) => e.strategy).sort()).toEqual(['fuzzy', 'rules']);
    expect(log[0]).toMatchObject({ testId: 'chromium::tests/a.spec.ts::passes', test: 'passes', project: 'chromium', key: 'login.submit' });
  });
});

describe('console errors in the run record', () => {
  it('stores console events of the last attempt', async () => {
    const record = await run(tmp());
    expect(record.tests.find((t) => t.title === 'fails')!.console).toEqual([{ type: 'pageerror', message: 'kaboom', timestamp: 1 }]);
    expect(record.tests.find((t) => t.title === 'passes')!.console).toEqual([]);
  });
});

describe('AI analysis embedding', () => {
  it('merges ai-analysis.json written during the run into the record and dashboard', async () => {
    const out = tmp();
    const record = await run(out, {}, () => {
      mkdirSync(join(out, 'report'), { recursive: true });
      writeFileSync(join(out, 'report', 'ai-analysis.json'), JSON.stringify({ [FAILED_ID]: 'Root cause: the API returned 500.' }));
    });
    expect(record.tests.find((t) => t.title === 'fails')!.analysis).toBe('Root cause: the API returned 500.');
    expect(readFileSync(join(out, 'report', 'index.html'), 'utf8')).toContain('Root cause: the API returned 500.');
  });

  it('ignores an analysis file left over from an earlier run', async () => {
    const out = tmp();
    mkdirSync(join(out, 'report'), { recursive: true });
    const file = join(out, 'report', 'ai-analysis.json');
    writeFileSync(file, JSON.stringify({ [FAILED_ID]: 'stale' }));
    const past = new Date(Date.now() - 3_600_000);
    utimesSync(file, past, past);
    const record = await run(out);
    expect(record.tests.find((t) => t.title === 'fails')!.analysis).toBeUndefined();
  });

  it('embedAnalysis updates the latest run and regenerates the dashboard when the AI reporter finishes last', async () => {
    const out = tmp();
    await run(out);
    expect(embedAnalysis(out, { [FAILED_ID]: 'late analysis', 'unknown::id': 'x' })).toBe(1);
    const runs = readHistory(join(out, 'history'));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.tests.find((t) => t.title === 'fails')!.analysis).toBe('late analysis');
    expect(readFileSync(join(out, 'report', 'index.html'), 'utf8')).toContain('late analysis');
    // Idempotent: an existing analysis is not overwritten.
    expect(embedAnalysis(out, { [FAILED_ID]: 'other' })).toBe(0);
  });

  it('embedAnalysis is a no-op without history', () => {
    expect(embedAnalysis(tmp(), { a: 'b' })).toBe(0);
  });

  it('readAnalysisFile tolerates missing and invalid files', () => {
    const dir = tmp();
    expect(readAnalysisFile(dir)).toEqual({});
    writeFileSync(join(dir, 'ai-analysis.json'), '[1,2]');
    expect(readAnalysisFile(dir)).toEqual({});
    writeFileSync(join(dir, 'ai-analysis.json'), JSON.stringify({ a: 'ok', b: 3 }));
    expect(readAnalysisFile(dir)).toEqual({ a: 'ok' });
  });
});

describe('notifications', () => {
  let server: Server;
  let url = '';
  let posts: Array<{ path?: string; body: any }> = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        posts.push({ path: req.url, body: JSON.parse(raw) });
        res.writeHead(req.url === '/broken' ? 500 : 200);
        res.end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    posts = [];
  });

  it('a failed run posts to every configured channel with the run counts', async () => {
    await run(tmp(), { env: 'staging', notifications: { slack: `${url}/slack`, teams: `${url}/teams`, reportUrl: 'https://ci/report' } });
    expect(posts.map((p) => p.path).sort()).toEqual(['/slack', '/teams']);
    const slack = posts.find((p) => p.path === '/slack')!.body;
    expect(slack.attachments[0].title).toContain('Playwright run (staging)');
    expect(slack.attachments[0].text).toContain('Total: *2*');
    expect(slack.attachments[0].text).toContain('Failed: *1*');
  });

  it('on: "failure" (default) stays silent for a passing run; on: "always" posts', async () => {
    const payload = { title: 't', status: 'passed' as const };
    expect(await notifyRun({ slack: `${url}/slack` }, payload)).toEqual({ sent: [], failed: [] });
    expect(posts).toHaveLength(0);
    expect(await notifyRun({ slack: `${url}/slack`, on: 'always' }, payload)).toEqual({ sent: ['slack'], failed: [] });
  });

  it('a rejected webhook is reported as a warning, never as a failed run', async () => {
    const out = tmp();
    await run(out, { notifications: { discord: `${url}/broken` } });
    expect(warn.mock.calls.some((c) => String(c[0]).includes('notification failed for: discord'))).toBe(true);
    expect(existsSync(join(out, 'report', 'summary.json'))).toBe(true);
  });
});
