import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runClean } from '../../src/cli/clean';
import { capture } from '../helpers/capture';
import { cleanupTmp, makeTmp, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

let dir: string;
beforeEach(() => {
  dir = makeTmp();
  writeFiles(dir, {
    '.features-gen/a.spec.js': 'x',
    'test-results/r.txt': 'x',
    'playwright-report/index.html': 'x',
    'blob-report/b.zip': 'x',
    '.testfly/report/index.html': 'x',
    '.testfly/sessions/admin.json': '{}',
    '.testfly/history/run-1.v1.json': '{}',
    '.testfly/ai-cache.json': '{}',
    'features/keep.feature': 'Feature: keep',
    'src/keep.ts': '',
  });
});

const has = (rel: string): boolean => fs.existsSync(path.join(dir, rel));

describe('testfly clean', () => {
  it('removes generated artifacts but keeps history, AI caches and sources', async () => {
    const { logs } = await capture(() => runClean({ cwd: dir }));
    for (const rel of ['.features-gen', 'test-results', 'playwright-report', 'blob-report', '.testfly/report', '.testfly/sessions']) expect(has(rel), rel).toBe(false);
    expect(has('.testfly/history/run-1.v1.json')).toBe(true);
    expect(has('.testfly/ai-cache.json')).toBe(true);
    expect(has('features/keep.feature')).toBe(true);
    expect(has('src/keep.ts')).toBe(true);
    expect(logs.join('\n')).toContain('Cleaned 6 directories.');
    expect(logs.join('\n')).toContain('Run history (.testfly/history) was kept');
  });

  it('--all also removes the run history', async () => {
    await capture(() => runClean({ cwd: dir, all: true }));
    expect(has('.testfly/history')).toBe(false);
    expect(has('.testfly/ai-cache.json')).toBe(true);
  });

  it('reports when there is nothing to clean', async () => {
    const empty = makeTmp();
    const { logs } = await capture(() => runClean({ cwd: empty }));
    expect(logs.join('\n')).toContain('Nothing to clean.');
  });
});
