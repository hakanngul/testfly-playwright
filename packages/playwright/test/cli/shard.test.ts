import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, writeRun, type RunRecord } from '@testfly/reporter';
import { discoverTestFiles, runShard } from '../../src/cli/shard';
import { capture } from '../helpers/capture';
import { cleanupTmp, makeTmp, makeTmpInPackage, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

function run(startedAt: number, tests: Array<{ file: string; durationMs: number }>): RunRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: `r${startedAt}`,
    startedAt,
    durationMs: 1000,
    status: 'passed',
    totals: { total: tests.length, passed: tests.length, failed: 0, flaky: 0, skipped: 0, quarantined: 0, healed: 0 },
    tests: tests.map((t, i) => ({
      id: `chromium::${t.file}::t${i}`,
      title: `t${i}`,
      titlePath: [t.file, `t${i}`],
      file: t.file,
      project: 'chromium',
      tags: [],
      status: 'passed',
      flaky: false,
      quarantined: false,
      retries: 0,
      durationMs: t.durationMs,
      heals: [],
      steps: [],
      api: [],
      ai: [],
      artifacts: [],
    })) as RunRecord['tests'],
  };
}

describe('testfly shard', () => {
  const files = ['tests/a.spec.ts', 'tests/b.spec.ts', 'tests/c.spec.ts', 'tests/d.spec.ts'];

  function seedHistory(): string {
    const dir = makeTmp();
    const history = path.join(dir, '.testfly', 'history');
    writeRun(history, run(1_000, [{ file: 'tests/a.spec.ts', durationMs: 60_000 }, { file: 'tests/b.spec.ts', durationMs: 30_000 }, { file: 'tests/c.spec.ts', durationMs: 20_000 }, { file: 'tests/d.spec.ts', durationMs: 10_000 }]));
    return dir;
  }

  it('prints a duration balanced shard as JSON', async () => {
    const dir = seedHistory();
    const out: Array<{ index: number; total: number; files: string[]; estimatedMs: number }> = [];
    for (const index of [1, 2]) {
      const { result, stdout } = await capture(() => runShard({ cwd: dir, total: 2, index, format: 'json', testFiles: files }));
      expect(result).toBe(0);
      out.push(JSON.parse(stdout));
    }
    expect(out[0]).toEqual({ index: 1, total: 2, files: ['tests/a.spec.ts'], estimatedMs: 60_000 });
    expect(out[1]).toEqual({ index: 2, total: 2, files: ['tests/b.spec.ts', 'tests/c.spec.ts', 'tests/d.spec.ts'], estimatedMs: 60_000 });
  });

  it('prints one file per line by default', async () => {
    const dir = seedHistory();
    const { stdout } = await capture(() => runShard({ cwd: dir, total: 2, index: 2, testFiles: files }));
    expect(stdout).toBe('tests/b.spec.ts\ntests/c.spec.ts\ntests/d.spec.ts\n');
  });

  it('honours a custom history dir and falls back to equal weights without history', async () => {
    const dir = makeTmp();
    const { stdout } = await capture(() => runShard({ cwd: dir, total: 2, index: 1, format: 'json', history: 'nope', testFiles: files }));
    const plan = JSON.parse(stdout) as { files: string[] };
    expect(plan.files).toHaveLength(2);
  });

  it('shards partition all files exactly once', async () => {
    const dir = seedHistory();
    const seen: string[] = [];
    for (const index of [1, 2, 3]) {
      const { stdout } = await capture(() => runShard({ cwd: dir, total: 3, index, format: 'json', testFiles: files }));
      seen.push(...(JSON.parse(stdout) as { files: string[] }).files);
    }
    expect(seen.sort()).toEqual(files);
  });

  it('rejects invalid total/index with exit code 2', async () => {
    const dir = makeTmp();
    for (const [total, index] of [[0, 1], [2, 0], [2, 3], [1.5, 1]] as const) {
      const { result, warns } = await capture(() => runShard({ cwd: dir, total, index, testFiles: files }));
      expect(result, `${total}/${index}`).toBe(2);
      expect(warns.join('\n')).toContain('--total must be >= 1');
    }
  });

  it('returns 1 when there are no test files', async () => {
    const { result, warns } = await capture(() => runShard({ cwd: makeTmp(), total: 1, index: 1, testFiles: [] }));
    expect(result).toBe(1);
    expect(warns.join('\n')).toContain('No test files found');
  });

  it('discovers test files through `playwright test --list` in a real project', async () => {
    const dir = makeTmpInPackage('shard-');
    writeFiles(dir, {
      'playwright.config.js': "module.exports = { testDir: './tests' };\n",
      'tests/one.spec.js': "const { test } = require('@playwright/test');\ntest('one', async () => {});\n",
      'tests/sub/two.spec.js': "const { test } = require('@playwright/test');\ntest('two', async () => {});\n",
    });
    expect(await discoverTestFiles(dir)).toEqual(['tests/one.spec.js', 'tests/sub/two.spec.js']);
    const { stdout } = await capture(() => runShard({ cwd: dir, total: 2, index: 1, format: 'json' }));
    const plan = JSON.parse(stdout) as { files: string[] };
    expect(plan.files.length).toBeGreaterThan(0);
  });
});
