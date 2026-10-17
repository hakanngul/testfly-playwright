import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readHistory } from '../src/history';
import { RunRecordSchema, type RunRecord } from '../src/schema';

const PKG = resolve(__dirname, '..');
const DIST = join(PKG, 'dist', 'index.js');
const PW_CLI = join(dirname(require.resolve('@playwright/test/package.json', { paths: [PKG] })), 'cli.js');

let proj: string;
const out = () => join(proj, '.testfly');

function runPw(args: string[] = [], env: Record<string, string> = {}) {
  const res = spawnSync(process.execPath, [PW_CLI, 'test', ...args], {
    cwd: proj,
    env: { ...process.env, CI: '', GITHUB_ACTIONS: '', TESTFLY_GATE: '', NO_COLOR: '1', ...env },
    encoding: 'utf8',
    timeout: 90_000,
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

beforeAll(() => {
  if (!existsSync(DIST)) throw new Error(`Build the reporter first: ${DIST} is missing (run "pnpm build")`);
  proj = mkdtempSync(join(tmpdir(), 'tf-real-'));
  // make `@playwright/test` resolvable from the temp project
  mkdirSync(join(proj, 'node_modules'), { recursive: true });
  symlinkSync(join(PKG, 'node_modules', '@playwright'), join(proj, 'node_modules', '@playwright'));
  mkdirSync(join(proj, 'tests'));
  writeFileSync(
    join(proj, 'playwright.config.ts'),
    `import { defineConfig } from '@playwright/test';
const gate = process.env.TESTFLY_GATE ? JSON.parse(process.env.TESTFLY_GATE) : undefined;
export default defineConfig({
  testDir: './tests',
  retries: 2,
  workers: 1,
  reporter: [[${JSON.stringify(DIST)}, { outputDir: '.testfly', qualityGate: gate, printSummary: true }]],
});
`,
  );
  writeFileSync(join(proj, 'tests', 'basic.spec.ts'), `
import { test, expect } from '@playwright/test';
test('passes', { tag: '@smoke' }, async () => { expect(1 + 1).toBe(2); });
test.describe('Group', () => {
  test('always fails', async () => { expect('Hello').toBe('Welcome'); });
});
test('skipped one', async () => { test.skip(true, 'not today'); });
`);
  writeFileSync(join(proj, 'tests', 'flaky.spec.ts'), `
import { test, expect } from '@playwright/test';
test('flaky via retry', async ({}, testInfo) => {
  if (testInfo.retry < 1) throw new TypeError("Cannot read properties of undefined (reading 'x')");
  expect(testInfo.retry).toBe(1);
});
`);
  writeFileSync(join(proj, 'tests', 'quarantined.spec.ts'), `
import { test, expect } from '@playwright/test';
test('quarantined and broken', { annotation: { type: 'quarantine', description: 'JIRA-42' } }, async () => {
  expect(1).toBe(2);
});
test('inline quarantine', async ({}, testInfo) => {
  testInfo.annotations.push({ type: 'quarantine', description: 'runtime reason' });
  throw new Error('net::ERR_CONNECTION_REFUSED at http://localhost:1/');
});
`);
  writeFileSync(join(proj, 'tests', 'attach.spec.ts'), `
import { test, expect } from '@playwright/test';
test('attaches testfly payloads', async ({}, testInfo) => {
  await testInfo.attach('heal', { body: JSON.stringify({ key: 'login.btn', original: '#a', healed: '#b', strategy: 'text', confidence: 0.8, timestamp: 1 }), contentType: 'application/vnd.testfly.heal+json' });
  await testInfo.attach('steps', { body: JSON.stringify([{ title: 'open', level: 'pass', offsetMs: 1 }]), contentType: 'application/vnd.testfly.step+json' });
  await testInfo.attach('bad', { body: '{broken', contentType: 'application/vnd.testfly.api+json' });
  expect(true).toBe(true);
});
`);
});

afterAll(() => { if (proj) rmSync(proj, { recursive: true, force: true }); });

// Each case spawns Playwright (spawnSync timeout 90s); the per-test timeout must exceed it.
const SPAWN_TEST_TIMEOUT = 120_000;

describe('real Playwright run with the built reporter (file paths are relative to config.rootDir = testDir)', { timeout: SPAWN_TEST_TIMEOUT }, () => {
  let run1: RunRecord;

  it('runs, exits non-zero because of the real failure, and prints the TestFly summary', () => {
    const r = runPw();
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('TestFly');
    expect(r.stdout).toMatch(/\d+ passed/);
    expect(r.stdout).toContain('Dashboard:');
    expect(r.stderr).not.toContain('[testfly] reporter failed');
  });

  it('writes a schema-valid history record with correct per-test outcomes', () => {
    const runs = readHistory(join(out(), 'history'));
    expect(runs).toHaveLength(1);
    run1 = runs[0]!;
    expect(RunRecordSchema.safeParse(run1).success).toBe(true);
    expect(run1.status).toBe('failed');
    expect(run1.playwrightVersion).toMatch(/^1\./);
    const t = (title: string) => run1.tests.find((x) => x.title === title)!;

    expect(t('passes')).toMatchObject({ status: 'passed', flaky: false, retries: 0, tags: ['@smoke'], file: 'basic.spec.ts', project: '' });
    expect(t('always fails')).toMatchObject({ status: 'failed', retries: 2, titlePath: ['Group', 'always fails'], triage: 'APPLICATION_BUG', flaky: false });
    expect(t('always fails').error!.message).toContain('Welcome');
    expect(t('always fails').error!.message).not.toContain('\u001b');
    expect(t('skipped one').status).toBe('skipped');
    expect(t('flaky via retry')).toMatchObject({ status: 'passed', flaky: true, retries: 1, triage: 'SYSTEM_FLAKY' });
    expect(t('flaky via retry').error!.message).toContain('TypeError');
    expect(t('quarantined and broken')).toMatchObject({ quarantined: true, quarantineReason: 'JIRA-42', status: 'failed' });
    expect(t('inline quarantine')).toMatchObject({ quarantined: true, quarantineReason: 'runtime reason', triage: 'SYSTEM_FLAKY' });
    expect(t('attaches testfly payloads').heals).toHaveLength(1);
    expect(t('attaches testfly payloads').steps).toHaveLength(1);

    expect(run1.totals).toEqual({ total: 7, passed: 3, failed: 1, flaky: 1, skipped: 1, quarantined: 2, healed: 1 });
  });

  it('writes summary.json, flakiness.json and the dashboard', () => {
    const summary = JSON.parse(readFileSync(join(out(), 'report', 'summary.json'), 'utf8'));
    expect(summary).toMatchObject({ status: 'failed', totals: run1.totals, gate: { passed: true } });
    expect(summary.warnings).toBe(1); // the deliberately broken api attachment
    const flak = JSON.parse(readFileSync(join(out(), 'report', 'flakiness.json'), 'utf8'));
    const ids = flak.map((f: { id: string }) => f.id);
    expect(ids).toContain('::basic.spec.ts::Group › always fails');
    expect(ids.some((i: string) => i.includes('quarantined'))).toBe(false); // quarantine is excluded from radar
    expect(flak.find((f: { title: string }) => f.title === 'flaky via retry')).toMatchObject({ flakyRuns: 1, risk: 'HIGH' });
    const html = readFileSync(join(out(), 'report', 'index.html'), 'utf8');
    expect(html).toContain('id="tf-data"');
    expect(html).toContain('always fails');
  });

  it('second run appends history and the radar spans both runs', () => {
    const r = runPw(['tests/basic.spec.ts']);
    expect(r.code).toBe(1);
    const runs = readHistory(join(out(), 'history'));
    expect(runs).toHaveLength(2);
    const flak = JSON.parse(readFileSync(join(out(), 'report', 'flakiness.json'), 'utf8'));
    expect(flak.find((f: { title: string }) => f.title === 'always fails')).toMatchObject({ runs: 2, failures: 2, failureRate: 1, risk: 'HIGH' });
    expect(flak.find((f: { title: string }) => f.title === 'passes')).toMatchObject({ runs: 2, failures: 0, risk: 'STABLE' });
  });

  it('a failing quality gate turns a green (flaky-only) run into exit code 1', () => {
    const green = runPw(['tests/flaky.spec.ts']);
    expect(green.code).toBe(0);
    const gated = runPw(['tests/flaky.spec.ts'], { TESTFLY_GATE: JSON.stringify({ maxFlaky: 0 }) });
    expect(gated.code).toBe(1);
    expect(gated.stdout).toContain('Quality gate: FAILED');
    const summary = JSON.parse(readFileSync(join(out(), 'report', 'summary.json'), 'utf8'));
    expect(summary).toMatchObject({ status: 'failed', gate: { passed: false } });
    expect(summary.gate.violations[0]).toContain('1 flaky');
  });

  it('records shard info with --shard', () => {
    runPw(['--shard=1/2', 'tests/basic.spec.ts']);
    const runs = readHistory(join(out(), 'history'));
    expect(runs[runs.length - 1]!.shard).toEqual({ current: 1, total: 2 });
  });

  it('records CI metadata when CI env vars are present', () => {
    runPw(['tests/flaky.spec.ts'], { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'acme/app', GITHUB_RUN_ID: '42', GITHUB_SHA: 'deadbeef' });
    const runs = readHistory(join(out(), 'history'));
    expect(runs[runs.length - 1]!.ci).toMatchObject({ provider: 'github-actions', commitSha: 'deadbeef', buildUrl: 'https://github.com/acme/app/actions/runs/42' });
  });

  it('applies quarantineFile without the fixture: quarantined failures do not fail the run', () => {
    writeFileSync(join(proj, 'testfly-quarantine.yml'), 'quarantine:\n  - test: "tests/basic.spec.ts › Group › always fails"\n    reason: JIRA-7\n');
    try {
      const r = runPw(['tests/basic.spec.ts']);
      expect(r.code).toBe(0);
      const runs = readHistory(join(out(), 'history'));
      const last = runs[runs.length - 1]!;
      expect(last.status).toBe('passed');
      expect(last.tests.find((x) => x.title === 'always fails')).toMatchObject({ quarantined: true, quarantineReason: 'JIRA-7', status: 'failed' });
      expect(last.totals).toMatchObject({ failed: 0, quarantined: 1 });
    } finally {
      rmSync(join(proj, 'testfly-quarantine.yml'), { force: true });
    }
  });
});
