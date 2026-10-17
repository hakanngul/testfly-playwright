import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs the Playwright suite in `e2e/` (fake device) with the JSON reporter and checks what the tests
 * cannot see from inside: error codes of expected failures, annotations and failure screenshots.
 */
interface FlatTest {
  title: string;
  project: string;
  status: string;
  annotations: Array<{ type: string; description?: string }>;
  attachments: Array<{ name: string; contentType: string }>;
  errors: string[];
}

const pkgRoot = path.resolve(__dirname, '..');
let tests: FlatTest[] = [];
let exitCode: number | null = null;

function flatten(suite: any, out: FlatTest[]): void {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const last = (t.results ?? []).at(-1) ?? {};
      out.push({
        title: spec.title,
        project: t.projectName,
        status: t.status,
        annotations: t.annotations ?? [],
        attachments: last.attachments ?? [],
        errors: (last.errors ?? []).map((e: any) => String(e.message ?? '')),
      });
    }
  }
  for (const child of suite.suites ?? []) flatten(child, out);
}

const find = (title: string, project?: string): FlatTest => {
  const hit = tests.find((t) => t.title === title && (!project || t.project === project));
  if (!hit) throw new Error(`test "${title}" not found in e2e report`);
  return hit;
};

beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-mobile-e2e-'));
  const out = path.join(dir, 'report.json');
  const r = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '-c', 'e2e', '--reporter=json'], {
    cwd: pkgRoot,
    encoding: 'utf8',
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out },
    timeout: 180_000,
  });
  exitCode = r.status;
  if (!fs.existsSync(out)) throw new Error(`no JSON report:\n${r.stdout}\n${r.stderr}`);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  for (const s of report.suites ?? []) flatten(s, tests);
  fs.rmSync(dir, { recursive: true, force: true });
}, 200_000);

describe('mobile e2e suite (fake device)', () => {
  it('passes, counting expected failures as passed', () => {
    expect(tests.length).toBeGreaterThanOrEqual(11);
    expect(tests.filter((t) => t.status !== 'expected')).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it('runs the same spec on ios and android projects', () => {
    for (const project of ['ios', 'android']) {
      expect(find('signs in with YAML locators resolved for the platform', project).status).toBe('expected');
    }
  });

  it('annotates the device and keeps running after a soft failure, with a screenshot attached', () => {
    const t = find('a failed soft assertion fails the test but lets it continue', 'ios');
    expect(t.annotations.map((a) => a.type)).toEqual(expect.arrayContaining(['mobile-device', 'continued-after-soft-failure']));
    expect(t.errors.join('\n')).toContain('soft check');
    expect(t.attachments).toContainEqual(expect.objectContaining({ name: 'mobile-screenshot', contentType: 'image/png' }));
    expect(find('records the device, reports Mobilewright actions as steps', 'ios').attachments.map((a) => a.name)).not.toContain('mobile-screenshot');
  });

  it.each([
    ['device fails with TF_MOBILE_LAUNCH_FAILED', 'TF_MOBILE_LAUNCH_FAILED', 'device is locked'],
    ['mobileLocate fails with TF_LOCATOR_NOT_FOUND', 'TF_LOCATOR_NOT_FOUND', 'no ios definition'],
    ['device fails with TF_CONFIG_MISSING', 'TF_CONFIG_MISSING', 'testfly.mobile is not configured'],
  ])('%s', (title, code, text) => {
    const message = find(title).errors.join('\n');
    expect(message).toContain(`[${code}]`);
    expect(message).toContain(text);
  });
});
