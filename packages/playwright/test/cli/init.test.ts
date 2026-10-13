import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runInit } from '../../src/cli/init';
import { GITIGNORE_ENTRIES, projectTemplates } from '../../src/cli/templates';
import { capture } from '../helpers/capture';
import { cleanupTmp, makeTmp, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const read = (dir: string, rel: string): string => fs.readFileSync(path.join(dir, rel), 'utf8');
const exists = (dir: string, rel: string): boolean => fs.existsSync(path.join(dir, rel));

describe('testfly init', () => {
  it('scaffolds the BDD flavour with a single playwright.config.ts using defineConfig', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'package.json': JSON.stringify({ name: 'my-app' }) });
    await capture(() => runInit({ cwd: dir }));

    for (const rel of ['playwright.config.ts', 'tests/example.spec.ts', 'locators/todo.yaml', 'features/todo.feature', 'steps/todo.steps.ts', '.gitignore']) {
      expect(exists(dir, rel), rel).toBe(true);
    }
    expect(exists(dir, 'testfly.config.ts')).toBe(false);
    const configs = fs.readdirSync(dir).filter((f) => /config/.test(f));
    expect(configs).toEqual(['playwright.config.ts']);

    const config = read(dir, 'playwright.config.ts');
    expect(config).toContain("import { defineConfig } from '@testfly/playwright/config'");
    expect(config).toMatch(/testfly:\s*\{/);
    expect(config).toContain('bdd:');
    expect(read(dir, 'steps/todo.steps.ts')).toContain("from '@testfly/playwright/bdd'");
    expect(read(dir, 'tests/example.spec.ts')).toContain("from '@testfly/playwright'");
  });

  it('--no-bdd skips features/steps and the bdd config', async () => {
    const dir = makeTmp();
    await capture(() => runInit({ cwd: dir, bdd: false }));
    expect(exists(dir, 'features')).toBe(false);
    expect(exists(dir, 'steps')).toBe(false);
    expect(exists(dir, 'tests/example.spec.ts')).toBe(true);
    const config = read(dir, 'playwright.config.ts');
    expect(config).toContain('defineConfig');
    expect(config).not.toContain('bdd:');
    expect(config).toContain("testDir: './tests'");
  });

  it('adds package.json scripts without overriding existing ones', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'package.json': JSON.stringify({ name: 'x', scripts: { test: 'my-own-test' } }) });
    await capture(() => runInit({ cwd: dir }));
    const pkg = JSON.parse(read(dir, 'package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBe('my-own-test');
    expect(pkg.scripts['test:ui']).toBe('testfly test --ui');
    expect(pkg.scripts['test:report']).toBe('testfly report');
    expect(pkg.scripts.doctor).toBe('testfly doctor');
  });

  it('works without a package.json and does not create one', async () => {
    const dir = makeTmp();
    await capture(() => runInit({ cwd: dir }));
    expect(exists(dir, 'package.json')).toBe(false);
  });

  it('does not overwrite existing files unless forced', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'playwright.config.ts': '// mine' });
    const first = await capture(() => runInit({ cwd: dir }));
    expect(read(dir, 'playwright.config.ts')).toBe('// mine');
    expect(first.logs.join('\n')).toContain('skipped   playwright.config.ts');
    await capture(() => runInit({ cwd: dir, force: true }));
    expect(read(dir, 'playwright.config.ts')).toContain('defineConfig');
  });

  it('creates .gitignore for new projects and appends only missing entries to an existing one', async () => {
    const fresh = makeTmp();
    await capture(() => runInit({ cwd: fresh }));
    const created = read(fresh, '.gitignore');
    for (const entry of GITIGNORE_ENTRIES) expect(created).toContain(entry);

    const existing = makeTmp();
    writeFiles(existing, { '.gitignore': 'dist\nnode_modules/' });
    await capture(() => runInit({ cwd: existing }));
    const merged = read(existing, '.gitignore');
    expect(merged.startsWith('dist\nnode_modules/\n')).toBe(true);
    expect(merged.match(/node_modules\//g)).toHaveLength(1);
    expect(merged).toContain('.features-gen/');
    expect(merged).toContain('# TestFly');

    // idempotent
    await capture(() => runInit({ cwd: existing }));
    expect(read(existing, '.gitignore')).toBe(merged);
  });

  it('templates: locator YAML is parseable and referenced keys exist', () => {
    const files = projectTemplates({ bdd: true });
    expect(Object.keys(files).sort()).toEqual(['features/todo.feature', 'locators/todo.yaml', 'playwright.config.ts', 'steps/todo.steps.ts', 'tests/example.spec.ts']);
    expect(files['locators/todo.yaml']).toContain('new_todo:');
    expect(files['tests/example.spec.ts']).toContain("locate('todo.new_todo')");
  });
});
