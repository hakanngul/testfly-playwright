import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createCli } from '../../src/cli';
import { cleanupTmp, makeTmp, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const pkgRoot = path.resolve(__dirname, '..', '..');
const bin = path.join(pkgRoot, 'bin', 'testfly.js');
const built = fs.existsSync(path.join(pkgRoot, 'dist', 'cli', 'bin.js'));

describe('createCli', () => {
  const program = createCli();

  it('registers every command', () => {
    expect(program.name()).toBe('testfly');
    expect(program.commands.map((c) => c.name()).sort()).toEqual(['ci', 'clean', 'doctor', 'generate', 'init', 'locators', 'quarantine', 'report', 'shard', 'steps', 'test']);
    const quarantine = program.commands.find((c) => c.name() === 'quarantine')!;
    expect(quarantine.commands.map((c) => c.name())).toEqual(['list']);
  });

  it('shard requires --total and --index', () => {
    const shard = program.commands.find((c) => c.name() === 'shard')!;
    const required = shard.options.filter((o) => o.mandatory).map((o) => o.long);
    expect(required.sort()).toEqual(['--index', '--total']);
  });

  it('init has --force and --no-bdd; legacy flags are gone', () => {
    const init = program.commands.find((c) => c.name() === 'init')!;
    const flags = init.options.map((o) => o.long);
    expect(flags).toEqual(expect.arrayContaining(['--force', '--no-bdd']));
    const report = program.commands.find((c) => c.name() === 'report')!;
    expect(report.options.map((o) => o.long)).not.toContain('--allure');
  });
});

describe.skipIf(!built)('built binary (bin/testfly.js)', () => {
  const run = (args: string[], cwd: string) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', timeout: 60_000 });

  it('--version prints the package version', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')) as { version: string };
    const r = run(['--version'], makeTmp());
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });

  it('init scaffolds a project', () => {
    const dir = makeTmp();
    const r = run(['init', '--no-bdd'], dir);
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(dir, 'playwright.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'features'))).toBe(false);
  });

  it('quarantine list and clean run end to end', () => {
    const dir = makeTmp();
    writeFiles(dir, { 'testfly-quarantine.yml': 'quarantine:\n  - "@flaky"\n', 'test-results/x': '1' });
    const q = run(['quarantine', 'list'], dir);
    expect(q.status).toBe(0);
    expect(q.stdout).toContain('[tag] @flaky');
    const c = run(['clean'], dir);
    expect(c.status).toBe(0);
    expect(fs.existsSync(path.join(dir, 'test-results'))).toBe(false);
  });

  it('shard exits with 2 for an invalid index and prints errors to stderr', () => {
    const dir = makeTmp();
    const r = run(['shard', '--total', '2', '--index', '5', '--format', 'json'], dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--total must be >= 1');
  });

  it('shard (json) works against a real project and fake history', () => {
    const dir = path.join(pkgRoot, '.tmp-test', `bin-shard-${process.pid}`);
    fs.mkdirSync(dir, { recursive: true });
    try {
      writeFiles(dir, {
        'playwright.config.js': "module.exports = { testDir: './tests' };\n",
        'tests/a.spec.js': "require('@playwright/test').test('a', async () => {});\n",
        'tests/b.spec.js': "require('@playwright/test').test('b', async () => {});\n",
      });
      const r = run(['shard', '--total', '2', '--index', '1', '--format', 'json'], dir);
      expect(r.status).toBe(0);
      const plan = JSON.parse(r.stdout) as { index: number; total: number; files: string[] };
      expect(plan).toMatchObject({ index: 1, total: 2 });
      expect(plan.files).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unknown command fails', () => {
    expect(run(['nope'], makeTmp()).status).not.toBe(0);
  });
});
