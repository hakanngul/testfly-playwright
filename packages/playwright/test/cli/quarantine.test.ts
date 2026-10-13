import { afterEach, describe, expect, it } from 'vitest';
import { runQuarantineList } from '../../src/cli/quarantine';
import { capture } from '../helpers/capture';
import { cleanupTmp, makeTmp, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

describe('testfly quarantine list', () => {
  it('reports an empty or missing file', async () => {
    const dir = makeTmp();
    const { result, logs } = await capture(() => runQuarantineList({ cwd: dir }));
    expect(result).toBe(0);
    expect(logs.join('\n')).toContain('No quarantine entries in testfly-quarantine.yml.');
  });

  it('lists active and expired entries with details', async () => {
    const dir = makeTmp();
    writeFiles(dir, {
      'testfly-quarantine.yml': [
        'quarantine:',
        '  - "@flaky"',
        '  - tests/old.spec.ts',
        '  - test: "tests/checkout.spec.ts › checkout › pays"',
        '    reason: gateway is down',
        '    project: chromium',
        '    until: 2999-12-31',
        '  - test: tests/gone.spec.ts',
        '    reason: should have been fixed',
        '    until: 2001-01-01',
      ].join('\n'),
    });
    const { result, logs } = await capture(() => runQuarantineList({ cwd: dir }));
    const out = logs.join('\n');
    expect(result).toBe(0);
    expect(out).toContain('3 active, 1 expired');
    expect(out).toContain('[tag] @flaky');
    expect(out).toContain('[file] tests/old.spec.ts');
    expect(out).toContain('[test] tests/checkout.spec.ts > checkout > pays project=chromium until=2999-12-31 - gateway is down');
    expect(out).toContain('Expired (no longer skipped):');
    expect(out).toContain('[file] tests/gone.spec.ts until=2001-01-01 - should have been fixed');
  });

  it('supports a custom file', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'custom.yml': 'quarantine:\n  - "@slow"\n' });
    const { logs } = await capture(() => runQuarantineList({ cwd: dir, file: 'custom.yml' }));
    expect(logs.join('\n')).toContain('Quarantine (custom.yml): 1 active, 0 expired');
  });

  it('propagates invalid-file errors (no silent fallback)', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'testfly-quarantine.yml': 'quarantine: "not a list"\n' });
    await expect(runQuarantineList({ cwd: dir })).rejects.toThrow(/TF_QUARANTINE_INVALID/);
  });
});
