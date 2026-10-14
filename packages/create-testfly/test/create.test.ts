import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
// Built by the `pretest` script (`pnpm build` of this package and its workspace dependencies).
const bin = path.join(root, 'dist', 'index.js');
// `testfly init` of the published @testfly/playwright package: the source of truth for the templates.
const testflyPkg = createRequire(import.meta.url).resolve('@testfly/playwright/package.json');
const testflyBin = path.join(path.dirname(testflyPkg), (JSON.parse(fs.readFileSync(testflyPkg, 'utf8')) as { bin: { testfly: string } }).bin.testfly);
const created: string[] = [];

function tmp(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'create-testfly-')));
  created.push(dir);
  return dir;
}
afterEach(() => {
  while (created.length) fs.rmSync(created.pop()!, { recursive: true, force: true });
});

function run(args: string[], cwd: string, env: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', env: { ...process.env, npm_config_user_agent: '', ...env } });
}
const read = (dir: string, rel: string): string => fs.readFileSync(path.join(dir, rel), 'utf8');
const files = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .sort();

describe('create-testfly (built binary)', () => {
  it('is built (run `pnpm test`, whose pretest builds it)', () => {
    expect(fs.existsSync(bin), `${bin} is missing`).toBe(true);
  });

  const ownVersion = (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string }).version;

  it('scaffolds the base project', () => {
    const cwd = tmp();
    const r = run(['my-app'], cwd);
    expect(r.status).toBe(0);
    const dir = path.join(cwd, 'my-app');
    expect(files(dir)).toEqual(['.gitignore', 'locators/todo.yaml', 'package.json', 'playwright.config.ts', 'tests/example.spec.ts', 'tsconfig.json']);
    expect(read(dir, 'playwright.config.ts')).toContain("from '@testfly/playwright/config'");
    expect(read(dir, 'playwright.config.ts')).not.toContain('bdd:');
    expect(read(dir, '.gitignore')).toContain('.features-gen/');
    expect(r.stdout).toContain('Created a TestFly project');
    expect(r.stdout).toContain('cd my-app');
  });

  it('writes a package.json with scripts and devDependencies', () => {
    const cwd = tmp();
    run(['My Cool_App'], cwd);
    const pkg = JSON.parse(read(path.join(cwd, 'My Cool_App'), 'package.json'));
    expect(pkg.name).toBe('my-cool_app');
    expect(pkg.private).toBe(true);
    expect(pkg.scripts).toEqual({ test: 'testfly test', 'test:ui': 'testfly test --ui', report: 'testfly report', locators: 'testfly locators', doctor: 'testfly doctor' });
    expect(pkg.devDependencies['@testfly/playwright']).toBe(`^${ownVersion}`);
    expect(pkg.devDependencies['@playwright/test']).toBe('^1.50.0');
    expect(pkg.devDependencies).toHaveProperty('typescript');
    expect(pkg.dependencies).toBeUndefined();
  });

  it('--bdd adds features, steps and the bdd config', () => {
    const cwd = tmp();
    const r = run(['bdd-app', '--bdd'], cwd);
    expect(r.status).toBe(0);
    const dir = path.join(cwd, 'bdd-app');
    expect(files(dir)).toEqual(['.gitignore', 'features/todo.feature', 'locators/todo.yaml', 'package.json', 'playwright.config.ts', 'steps/todo.steps.ts', 'tests/example.spec.ts', 'tsconfig.json']);
    const config = read(dir, 'playwright.config.ts');
    expect(config).toContain('bdd:');
    expect(config).toContain("features: 'features/**/*.feature'");
    expect(read(dir, 'steps/todo.steps.ts')).toContain("from '@testfly/playwright/bdd'");
    expect(r.stdout).toContain('Created a BDD TestFly project');
  });

  it('scaffolds into the current directory when it is empty (".")', () => {
    const cwd = tmp();
    expect(run(['.'], cwd).status).toBe(0);
    expect(fs.existsSync(path.join(cwd, 'playwright.config.ts'))).toBe(true);
    expect(JSON.parse(read(cwd, 'package.json')).name).toBe(path.basename(cwd).toLowerCase().replace(/[^a-z0-9-_.]+/g, '-').replace(/^[-_.]+|[-_.]+$/g, ''));
  });

  it('refuses a non-empty directory and does not touch it', () => {
    const cwd = tmp();
    fs.mkdirSync(path.join(cwd, 'taken'));
    fs.writeFileSync(path.join(cwd, 'taken', 'keep.txt'), 'x');
    const r = run(['taken'], cwd);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('already exists and is not empty');
    expect(files(path.join(cwd, 'taken'))).toEqual(['keep.txt']);
  });

  it('prints instructions for the chosen package manager', () => {
    const cwd = tmp();
    const pnpm = run(['a', '--pm', 'pnpm'], cwd);
    expect(pnpm.stdout).toContain('pnpm install');
    expect(pnpm.stdout).toContain('pnpm exec playwright install chromium');
    const yarn = run(['b', '--pm=yarn'], cwd);
    expect(yarn.stdout).toContain('yarn install');
    expect(yarn.stdout).toContain('yarn playwright install chromium');
    const detected = run(['c'], cwd, { npm_config_user_agent: 'pnpm/10.0.0 npm/? node/v22' });
    expect(detected.stdout).toContain('pnpm install');
    const npm = run(['d'], cwd);
    expect(npm.stdout).toContain('npx playwright install chromium');
    expect(npm.stdout).toContain('npm test');
  });

  it('validates arguments', () => {
    const cwd = tmp();
    expect(run([], cwd).status).toBe(1);
    expect(run([], cwd).stderr).toContain('Missing project directory');
    expect(run(['x', '--pm', 'bun'], cwd).status).toBe(1);
    expect(run(['x', '--nope'], cwd).stderr).toContain('Unknown option --nope');
    expect(run(['x', 'y'], cwd).stderr).toContain('Unexpected argument "y"');
    expect(fs.existsSync(path.join(cwd, 'x'))).toBe(false);
  });

  it('--help prints usage', () => {
    const r = run(['--help'], tmp());
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('npm create testfly@latest <directory>');
    expect(r.stdout).toContain('--bdd');
  });
});

describe('templates stay in sync with `testfly init`', () => {
  const tplRoot = path.join(root, 'templates');

  function init(args: string[]): string {
    const cwd = tmp();
    const r = spawnSync(process.execPath, [testflyBin, 'init', ...args], { cwd, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    return cwd;
  }

  it('base + bdd templates equal the init templates (modulo gitignore)', () => {
    const base = init(['--no-bdd']);
    const baseFiles = files(base).filter((rel) => rel !== '.gitignore');
    expect(baseFiles).toEqual(['locators/todo.yaml', 'playwright.config.ts', 'tests/example.spec.ts']);
    for (const rel of baseFiles) {
      expect(fs.readFileSync(path.join(tplRoot, 'base', rel), 'utf8'), `base/${rel}`).toBe(read(base, rel));
    }
    const bdd = init([]);
    for (const rel of ['playwright.config.ts', 'features/todo.feature', 'steps/todo.steps.ts']) {
      expect(fs.readFileSync(path.join(tplRoot, 'bdd', rel), 'utf8'), `bdd/${rel}`).toBe(read(bdd, rel));
    }
  });

  it('ships the gitignore as _gitignore (npm strips .gitignore)', () => {
    expect(fs.existsSync(path.join(tplRoot, 'base', '_gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(tplRoot, 'base', '.gitignore'))).toBe(false);
  });
});
