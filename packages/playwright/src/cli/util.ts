import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, type SpawnOptions } from 'node:child_process';

const selfRequire = createRequire(__filename);

/** Print a line. @internal */
export function log(message = ''): void {
  console.log(message);
}

/** Print a warning. @internal */
export function warn(message: string): void {
  console.warn(`warning: ${message}`);
}

/** Resolve a module entry from the user's project first, then from this package. @internal */
export function resolveFromProject(specifier: string, cwd: string = process.cwd()): string | undefined {
  const attempts = [() => createRequire(path.join(cwd, 'noop.js')).resolve(specifier), () => selfRequire.resolve(specifier)];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      /* next */
    }
  }
  return undefined;
}

/** Run a node script with inherited stdio; resolves with the exit code. @internal */
export function runNode(script: string, args: string[], options: SpawnOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

/** Run a node script and capture stdout. @internal */
export function captureNode(script: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** Path to Playwright's CLI (project install preferred). @internal */
export function playwrightCli(cwd: string = process.cwd()): string {
  const cli = resolveFromProject('@playwright/test/cli', cwd);
  if (!cli) throw new Error('Cannot find @playwright/test. Install it with: npm i -D @playwright/test');
  return cli;
}

/** Path to the playwright-bdd generator CLI (bddgen). @internal */
export function bddgenCli(): string | undefined {
  try {
    const main = selfRequire.resolve('playwright-bdd');
    const candidate = path.join(path.dirname(main), 'cli', 'index.js');
    return fs.existsSync(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/** Locate the Playwright config in `cwd`. @internal */
export function findPlaywrightConfig(cwd: string = process.cwd(), explicit?: string): string | undefined {
  if (explicit) {
    const full = path.resolve(cwd, explicit);
    return fs.existsSync(full) ? full : undefined;
  }
  for (const ext of ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']) {
    const full = path.join(cwd, `playwright.config.${ext}`);
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}

/** Heuristic: does the config enable BDD (testfly.bdd or defineBddConfig)? @internal */
export function usesBdd(configFile: string | undefined): boolean {
  if (!configFile) return false;
  try {
    const text = fs.readFileSync(configFile, 'utf8');
    return /\bbdd\s*:/.test(text) || /defineBddConfig|defineBddProject/.test(text);
  } catch {
    return false;
  }
}

/** Generate BDD spec files with playwright-bdd. Returns the exit code. @internal */
export async function runBddgen(cwd: string, configFile?: string): Promise<number> {
  const cli = bddgenCli();
  if (!cli) {
    warn('playwright-bdd could not be resolved; skipping BDD generation.');
    return 0;
  }
  return runNode(cli, configFile ? ['--config', configFile] : [], { cwd });
}
