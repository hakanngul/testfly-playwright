import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullConfig, FullResult, TestCase, TestResult } from '@playwright/test/reporter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerProvider } from '../src';
import AiFailureAnalysisReporter from '../src/reporter';
import { checkPatch, diffPaths, extractDiff } from '../src/remediation';
import { FakeProvider } from './helpers/fake-provider';

const SPEC = `import { test, expect } from '@playwright/test';

test('greets', async ({ page }) => {
  await page.setContent('<h1>Hello</h1>');
  await expect(page.locator('h1')).toHaveText('Helo');
});
`;

const GOOD_DIFF = `--- a/tests/a.spec.ts
+++ b/tests/a.spec.ts
@@ -2,5 +2,5 @@
 
 test('greets', async ({ page }) => {
   await page.setContent('<h1>Hello</h1>');
-  await expect(page.locator('h1')).toHaveText('Helo');
+  await expect(page.locator('h1')).toHaveText('Hello');
 });
`;

let dir: string;
let fake: FakeProvider;
let logs: string[];
registerProvider('patchfake', () => ({ name: 'patchfake', complete: (r) => fake.complete(r) }));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tf-ai-patch-'));
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests', 'a.spec.ts'), SPEC);
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('diff helpers', () => {
  it('extracts a fenced or raw diff and honours NO_PATCH', () => {
    expect(extractDiff('Here you go:\n```diff\n' + GOOD_DIFF + '```\nthanks')).toBe(GOOD_DIFF);
    expect(extractDiff(GOOD_DIFF)).toBe(GOOD_DIFF);
    expect(extractDiff('NO_PATCH')).toBeUndefined();
    expect(extractDiff('just prose, no diff')).toBeUndefined();
  });

  it('lists touched paths', () => {
    expect(diffPaths(GOOD_DIFF)).toEqual(['tests/a.spec.ts']);
    expect(diffPaths('--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+x\n')).toEqual(['new.ts']);
  });

  it('checkPatch accepts a clean patch to the spec and rejects others', () => {
    expect(checkPatch(GOOD_DIFF, dir, 'tests/a.spec.ts')).toEqual({ ok: true });
    expect(checkPatch(GOOD_DIFF.replace(/a\.spec/g, 'b.spec'), dir, 'tests/a.spec.ts')).toMatchObject({ ok: false, reason: expect.stringContaining('only tests/a.spec.ts') });
    const stale = GOOD_DIFF.replace("toHaveText('Helo');\n+", "toHaveText('Nope');\n+");
    expect(checkPatch(stale, dir, 'tests/a.spec.ts')).toMatchObject({ ok: false, reason: expect.stringContaining('git apply --check failed') });
  });
});

function mkTest(): TestCase {
  return {
    retries: 0,
    location: { file: join(dir, 'tests', 'a.spec.ts'), line: 3, column: 1 },
    titlePath: () => ['', 'chromium', 'a.spec.ts', 'greets'],
    parent: { project: () => ({ name: 'chromium' }) },
  } as unknown as TestCase;
}
const failed = { status: 'failed', retry: 0, errors: [{ message: 'Expected "Helo" received "Hello"' }], attachments: [] } as unknown as TestResult;

async function runReporter(patchAnswer: string, opts: { patches?: boolean; maxPatches?: number } = { patches: true }): Promise<void> {
  fake = new FakeProvider((req) => (req.system.includes('unified diff') ? patchAnswer : 'analysis text'));
  const r = new AiFailureAnalysisReporter({ provider: 'patchfake' as never, outputDir: join(dir, 'out'), ...opts });
  r.onBegin({ rootDir: dir } as FullConfig, undefined as never);
  r.onTestEnd(mkTest(), failed);
  await r.onEnd({ status: 'failed' } as FullResult);
}

describe('AiFailureAnalysisReporter patches', () => {
  it('writes a validated patch and never modifies the spec', async () => {
    await runReporter('```diff\n' + GOOD_DIFF + '```');
    const files = readdirSync(join(dir, 'out', 'remediations'));
    expect(files).toEqual(['chromium-a-spec-ts-greets.patch']);
    const patch = readFileSync(join(dir, 'out', 'remediations', files[0]!), 'utf8');
    expect(patch).toContain('# Review before applying');
    expect(patch).toContain("+  await expect(page.locator('h1')).toHaveText('Hello');");
    expect(readFileSync(join(dir, 'tests', 'a.spec.ts'), 'utf8')).toBe(SPEC);
    const patchPrompt = fake.requests.find((q) => q.system.includes('unified diff'))!;
    expect(patchPrompt.messages[0]!.content).toContain('File: tests/a.spec.ts');
    expect(patchPrompt.messages[0]!.content).toContain('Prior analysis:\nanalysis text');
    expect(logs.join('\n')).toContain('patch proposed → out/remediations/chromium-a-spec-ts-greets.patch');
  });

  it('discards a patch that does not apply, and records NO_PATCH answers', async () => {
    await runReporter(GOOD_DIFF.replace("toHaveText('Helo');\n+", "toHaveText('Nope');\n+"));
    expect(existsSync(join(dir, 'out', 'remediations'))).toBe(false);
    expect(logs.join('\n')).toContain('discarded: git apply --check failed');

    logs.length = 0;
    await runReporter('NO_PATCH');
    expect(logs.join('\n')).toContain('no patch proposed');
  });

  it('is off by default and capped by maxPatches', async () => {
    await runReporter(GOOD_DIFF, {});
    expect(fake.requests.some((q) => q.system.includes('unified diff'))).toBe(false);
    await runReporter(GOOD_DIFF, { patches: true, maxPatches: 0 });
    expect(fake.requests.some((q) => q.system.includes('unified diff'))).toBe(false);
  });
});
