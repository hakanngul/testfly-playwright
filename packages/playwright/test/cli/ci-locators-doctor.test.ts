import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCi } from '../../src/cli/ci';
import { runLocatorsCommand } from '../../src/cli/locators';
import { runDoctor } from '../../src/cli/doctor';
import { DoctorService } from '../../src/cli/doctor/DoctorService';
import { runReport } from '../../src/cli/report';
import { capture } from '../helpers/capture';
import { cleanupTmp, makeTmp, makeTmpInPackage, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

describe('testfly ci', () => {
  it('writes a GitHub workflow with the detected package manager', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'pnpm-lock.yaml': '' });
    const { result } = await capture(() => runCi({ cwd: dir }));
    expect(result).toBe(0);
    const yml = fs.readFileSync(path.join(dir, '.github/workflows/testfly.yml'), 'utf8');
    expect(yml).toContain('pnpm install --frozen-lockfile');
    expect(yml).toContain('pnpm/action-setup@v4');
    expect(yml).toContain('npx testfly test');
    expect(yml).not.toContain('matrix');
  });

  it('adds a shard matrix that uses `testfly shard`', async () => {
    const dir = makeTmp();
    await capture(() => runCi({ cwd: dir, shards: 3, pm: 'npm' }));
    const yml = fs.readFileSync(path.join(dir, '.github/workflows/testfly.yml'), 'utf8');
    expect(yml).toContain('shard: [1, 2, 3]');
    expect(yml).toContain('npx testfly shard --total 3 --index ${{ matrix.shard }}');
    expect(yml).toContain('npm ci');
  });

  it('writes a GitLab pipeline, refuses to overwrite without --force and rejects unknown providers', async () => {
    const dir = makeTmp();
    expect((await capture(() => runCi({ cwd: dir, provider: 'gitlab', pm: 'yarn' }))).result).toBe(0);
    expect(fs.readFileSync(path.join(dir, '.gitlab-ci.yml'), 'utf8')).toContain('yarn install --frozen-lockfile');
    const again = await capture(() => runCi({ cwd: dir, provider: 'gitlab' }));
    expect(again.result).toBe(1);
    expect(again.warns.join('')).toContain('already exists');
    expect((await capture(() => runCi({ cwd: dir, provider: 'gitlab', force: true }))).result).toBe(0);
    const unknown = await capture(() => runCi({ cwd: dir, provider: 'jenkins' }));
    expect(unknown.result).toBe(2);
  });
});

describe('testfly locators', () => {
  it('fails when the directory is missing', async () => {
    const { result, warns } = await capture(() => runLocatorsCommand({ cwd: makeTmp() }));
    expect(result).toBe(1);
    expect(warns.join('')).toContain('not found');
  });

  it('generates typed keys from the YAML catalog', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'locators/login.yaml': 'submit:\n  role: button\n  name: Sign in\nemail:\n  label: Email\n' });
    const { result, logs } = await capture(() => runLocatorsCommand({ cwd: dir }));
    expect(result).toBe(0);
    expect(logs.join('\n')).toContain('Found 2 locator(s)');
    const dts = fs.readFileSync(path.join(dir, 'locators', 'index.d.ts'), 'utf8');
    expect(dts).toContain('login.submit');
    expect(dts).toContain('login.email');
  });
});

describe('testfly doctor', () => {
  it('fails without a Playwright config and points to init', async () => {
    const dir = makeTmp();
    const checks = await DoctorService.diagnose(dir);
    const config = checks.find((c) => c.name === 'Playwright config')!;
    expect(config.status).toBe('fail');
    expect(config.solution).toBe('npx testfly init');
    expect((await capture(() => runDoctor({ cwd: dir }))).result).toBe(1);
  });

  it('passes for a project using defineConfig and warns about legacy config / missing locators', async () => {
    const dir = makeTmp();
    writeFiles(dir, {
      'playwright.config.ts': "import { defineConfig } from '@testfly/playwright/config';\nexport default defineConfig({});\n",
      'testfly.config.ts': '// legacy',
    });
    const checks = await DoctorService.diagnose(dir);
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
    expect(byName['Node.js']!.status).toBe('pass');
    expect(byName['Playwright config']!.status).toBe('pass');
    expect(byName['Legacy config']!.status).toBe('warn');
    expect(byName.Locators!.status).toBe('warn');
  });

  it('flags a config that does not use defineConfig and detects unmapped BDD steps', async () => {
    const dir = makeTmp();
    writeFiles(dir, {
      'playwright.config.ts': "export default { bdd: {} };\n",
      'features/a.feature': 'Feature: x\n  Scenario: s\n    Given nothing defined\n',
      'steps/a.ts': '',
    });
    const checks = await DoctorService.diagnose(dir);
    expect(checks.find((c) => c.message.includes('does not use defineConfig'))).toBeDefined();
    expect(checks.find((c) => c.name === 'BDD steps')).toMatchObject({ status: 'warn', solution: 'npx testfly steps --scaffold' });
  });

  it('resolves @playwright/test and reporter in a project that has them installed', async () => {
    const dir = makeTmpInPackage('doctor-');
    writeFiles(dir, { 'playwright.config.ts': "import { defineConfig } from '@testfly/playwright/config';\nexport default defineConfig({});\n", 'locators/a.yaml': 'k:\n  css: a\n' });
    const checks = await DoctorService.diagnose(dir);
    expect(checks.find((c) => c.name === '@playwright/test')!.status).toBe('pass');
    expect(checks.find((c) => c.name === '@testfly/reporter')!.status).toBe('pass');
    expect(checks.find((c) => c.name === 'Locators')!.status).toBe('pass');
  });
});

describe('testfly report', () => {
  it('fails clearly when no dashboard / HTML report exists and for unknown types', async () => {
    const dir = makeTmp();
    expect((await capture(() => runReport(undefined, { cwd: dir }))).result).toBe(1);
    expect((await capture(() => runReport('html', { cwd: dir }))).result).toBe(1);
    const unknown = await capture(() => runReport('pdf', { cwd: dir }));
    expect(unknown.result).toBe(1);
    expect(unknown.warns.join('')).toContain('Unknown report type "pdf"');
  });
});
