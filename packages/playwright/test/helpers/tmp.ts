import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const created: string[] = [];

/** Create a temp directory that is removed by {@link cleanupTmp}. */
export function makeTmp(prefix = 'testfly-test-'): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  created.push(dir);
  return dir;
}

/** Write files (relative path -> content) under `root`. */
export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
}

export function cleanupTmp(): void {
  while (created.length) fs.rmSync(created.pop()!, { recursive: true, force: true });
}

/** Run `fn` with `process.cwd()` pointing at `dir`. */
export async function withCwd<T>(dir: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

/** Temporarily set/unset environment variables while `fn` runs. */
export async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Temp dir INSIDE the package so that node resolution finds node_modules (@playwright/test…). */
export function makeTmpInPackage(prefix = 'tmp-'): string {
  const root = path.resolve(__dirname, '..', '..', '.tmp-test');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, prefix));
  created.push(dir);
  return dir;
}
