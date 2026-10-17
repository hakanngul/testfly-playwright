import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONTENT_TYPES, ApiEventSchema, ConsoleEventSchema, HealEventSchema, StepEventSchema } from '@testfly/reporter/schema';
import { cleanupTmp, makeTmp } from '../helpers/tmp';

/**
 * Runs the Playwright integration suite in `e2e/` with the JSON reporter and checks the DATA CONTRACT
 * (attachments consumed by @testfly/reporter) plus the error codes of expected failures. The suite
 * itself (`npm run test:e2e`) asserts fixture behaviour from inside the tests.
 */
interface JsonAttachment {
  name: string;
  contentType: string;
  body?: string;
}
interface FlatTest {
  title: string;
  file: string;
  project: string;
  status: string;
  annotations: Array<{ type: string; description?: string }>;
  attachments: JsonAttachment[];
  errors: string[];
}

const pkgRoot = path.resolve(__dirname, '..', '..');
let tests: FlatTest[] = [];
let exitCode: number | null = null;

function flatten(suite: any, out: FlatTest[]): void {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const results = t.results ?? [];
      const last = results[results.length - 1] ?? {};
      out.push({
        title: spec.title,
        file: spec.file,
        project: t.projectName,
        status: t.status === 'expected' ? 'passed' : t.status,
        annotations: t.annotations ?? [],
        attachments: results.flatMap((r: any) => r.attachments ?? []),
        errors: (last.errors ?? []).map((e: any) => String(e.message ?? '')),
      });
    }
  }
  for (const child of suite.suites ?? []) flatten(child, out);
}

const find = (title: string): FlatTest => {
  const hit = tests.find((t) => t.title === title);
  if (!hit) throw new Error(`test "${title}" not found in e2e report`);
  return hit;
};
const body = (a: JsonAttachment): any => JSON.parse(Buffer.from(a.body ?? '', 'base64').toString('utf8'));

beforeAll(() => {
  const out = path.join(makeTmp(), 'report.json');
  const r = spawnSync(
    process.execPath,
    [
      require.resolve('@playwright/test/cli'),
      'test',
      '-c',
      'e2e',
      'core.spec.ts',
      'api.spec.ts',
      'locate.spec.ts',
      'quarantine.spec.ts',
      'unconfigured.spec.ts',
      'assertions.spec.ts',
      'console.spec.ts',
      'console-fail.spec.ts',
      'mock-server.spec.ts',
      'suite-context.spec.ts',
      '--reporter=json',
    ],
    { cwd: pkgRoot, encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out }, timeout: 180_000 },
  );
  exitCode = r.status;
  if (!fs.existsSync(out)) throw new Error(`no JSON report produced.\n${r.stdout}\n${r.stderr}`);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  tests = [];
  for (const suite of report.suites) flatten(suite, tests);
  cleanupTmp();
}, 200_000);

describe('integration suite data contract', () => {
  it('the whole e2e selection is green', () => {
    expect(exitCode).toBe(0);
    expect(tests.length).toBeGreaterThan(20);
    expect(tests.filter((t) => t.status === 'unexpected' || t.status === 'flaky')).toEqual([]);
  });

  it('step fixture attaches exactly one testfly-steps attachment with the step content type', () => {
    const t = find('callable step returns the body result and records events');
    const steps = t.attachments.filter((a) => a.name === 'testfly-steps');
    expect(steps).toHaveLength(1);
    expect(steps[0]!.contentType).toBe(CONTENT_TYPES.step);
    const events = body(steps[0]!) as unknown[];
    expect(events).toHaveLength(5);
    for (const e of events) expect(StepEventSchema.safeParse(e).success).toBe(true);
    expect(events[0]).toMatchObject({ title: 'compute', level: 'pass' });
  });

  it('a failing step is attached as a fail event', () => {
    const t = find('a failing step body is recorded as fail and rethrown');
    const events = body(t.attachments.find((a) => a.name === 'testfly-steps')!) as Array<{ level: string; title: string }>;
    expect(events).toMatchObject([{ level: 'fail', title: 'explodes' }]);
  });

  it('tests that log no steps attach no testfly-steps', () => {
    expect(find('is isolated per test').attachments.some((a) => a.name === 'testfly-steps')).toBe(false);
  });

  it('api fixture attaches request events (once per test) with the api content type', () => {
    const t = find('POST json, form and query params');
    const api = t.attachments.filter((a) => a.name === 'testfly-api');
    expect(api).toHaveLength(1);
    expect(api[0]!.contentType).toBe(CONTENT_TYPES.api);
    const events = body(api[0]!) as Array<Record<string, unknown>>;
    expect(events.length).toBe(2);
    for (const e of events) expect(ApiEventSchema.safeParse(e).success).toBe(true);
    expect(events[0]).toMatchObject({ method: 'POST', status: 200 });
  });

  it('healing attaches a heal event and annotates the test', () => {
    const t = find('heal() repairs a broken selector, annotates and attaches a heal event');
    const heal = t.attachments.find((a) => a.name === 'testfly-heal')!;
    expect(heal.contentType).toBe(CONTENT_TYPES.heal);
    const event = body(heal);
    expect(HealEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({ key: 'home.submit', strategy: expect.any(String) });
    expect(t.annotations.find((a) => a.type === 'healed')?.description).toContain('home.submit');
  });

  it('YAML fallbacks produce no heal attachment', () => {
    expect(find('YAML fallbacks are part of the locator (no healing event)').attachments.some((a) => a.name === 'testfly-heal')).toBe(false);
  });

  it('quarantined tests are skipped with a quarantine annotation; others run', () => {
    const byTitle = find('quarantined by title');
    expect(byTitle.status).toBe('skipped');
    expect(byTitle.annotations).toContainEqual(expect.objectContaining({ type: 'quarantine', description: 'known flaky upstream' }));
    const byTag = find('quarantined by tag');
    expect(byTag.status).toBe('skipped');
    expect(byTag.annotations.some((a) => a.type === 'quarantine')).toBe(true);
    expect(find('not quarantined runs normally').status).toBe('passed');
  });

  it('unconfigured db / redis / mail fixtures fail with their documented error codes', () => {
    const expectations: Record<string, string> = {
      'db without config': 'TF_DB_NOT_CONFIGURED',
      'redis without config': 'TF_DB_NOT_CONFIGURED',
      'mail without config': 'TF_MAIL_NOT_CONFIGURED',
    };
    for (const [title, code] of Object.entries(expectations)) {
      const t = find(title);
      expect(t.project).toBe('unconfigured');
      expect(t.errors.join('\n'), title).toContain(`[${code}]`);
    }
  });

  it('consoleErrors attaches browser errors with the console content type (report mode)', () => {
    const t = find('collects uncaught exceptions and console.error without failing the test');
    expect(t.status).toBe('passed');
    const att = t.attachments.find((a) => a.name === 'testfly-console')!;
    expect(att.contentType).toBe(CONTENT_TYPES.console);
    const events = body(att) as unknown[];
    expect(events).toHaveLength(2);
    for (const e of events) expect(ConsoleEventSchema.safeParse(e).success).toBe(true);
    expect(find('a clean page records nothing').attachments.some((a) => a.name === 'testfly-console')).toBe(false);
  });

  it('consoleErrors fail mode fails a passing test with TF_CONSOLE_ERRORS and honours ignore', () => {
    const failed = find('fail mode fails a passing test that logged errors');
    expect(failed.project).toBe('console-fail');
    expect(failed.errors.join('\n')).toContain('[TF_CONSOLE_ERRORS]');
    expect(find('ignored messages do not fail the test').status).toBe('passed');
    expect(find('fail mode keeps a clean test green').status).toBe('passed');
  });

  it('extra expect matchers pass against a real browser', () => {
    for (const title of ['validity, required, read-only and maxlength', 'cookie, localStorage and window count', 'count bounds wait for late elements']) {
      expect(find(title).status, title).toBe('passed');
    }
  });

  it('mockServer, api.batch/interceptors and suiteCtx work without a page', () => {
    for (const title of [
      'stubs a service and verifies the calls the client made',
      'each test starts with a clean server (no stubs, no history)',
      'batch + interceptor against the mock server',
      'second test in the same worker reads it; ctx is fresh',
    ]) {
      expect(find(title).status, title).toBe('passed');
    }
  });
});
