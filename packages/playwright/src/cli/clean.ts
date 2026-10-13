import fs from 'node:fs';
import path from 'node:path';
import { log, warn } from './util';

/** Options of `testfly clean`. @internal */
export interface CleanOptions {
  cwd?: string;
  /** Also remove run history, sessions and the dashboard (`.testfly/history|report|sessions`). */
  all?: boolean;
}

const GENERATED = ['.features-gen', 'test-results', 'playwright-report', 'blob-report'];
const TESTFLY_GENERATED = ['.testfly/report', '.testfly/sessions'];
const TESTFLY_HISTORY = ['.testfly/history'];

/** Remove generated test artifacts. History is kept unless `all` is set. @internal */
export async function runClean(options: CleanOptions = {}): Promise<void> {
  const root = options.cwd ?? process.cwd();
  const targets = [...GENERATED, ...TESTFLY_GENERATED, ...(options.all ? TESTFLY_HISTORY : [])];
  let removed = 0;
  for (const rel of targets) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    try {
      fs.rmSync(full, { recursive: true, force: true });
      log(`  removed ${rel}/`);
      removed++;
    } catch (error) {
      warn(`could not remove ${rel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  log(removed === 0 ? 'Nothing to clean.' : `Cleaned ${removed} director${removed === 1 ? 'y' : 'ies'}.`);
  if (!options.all) log('Run history (.testfly/history) was kept; use --all to remove it.');
}
