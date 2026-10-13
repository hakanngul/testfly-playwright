import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

export function useTmpDirs(): () => string {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  return () => {
    const d = mkdtempSync(join(tmpdir(), 'tf-rep-'));
    dirs.push(d);
    return d;
  };
}
