import path from 'node:path';
import { log } from './util';

/** Options of `testfly quarantine list`. @internal */
export interface QuarantineListOptions {
  file?: string;
  cwd?: string;
}

/** Print active and expired quarantine entries. Returns the exit code. @internal */
export async function runQuarantineList(options: QuarantineListOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const file = path.resolve(cwd, options.file ?? 'testfly-quarantine.yml');
  const { loadQuarantine } = await import('@testfly/reporter');
  const list = loadQuarantine(file);
  const rel = path.relative(cwd, file) || file;

  if (list.entries.length === 0 && list.expired.length === 0) {
    log(`No quarantine entries in ${rel}.`);
    return 0;
  }
  const describe = (entry: (typeof list.entries)[number]): string => {
    const target = entry.kind === 'tag' ? (entry.tag ?? '') : [entry.file, ...(entry.titlePath ?? [])].join(' > ');
    const parts = [`[${entry.kind}]`, target];
    if (entry.project) parts.push(`project=${entry.project}`);
    if (entry.untilMs) parts.push(`until=${new Date(entry.untilMs).toISOString().slice(0, 10)}`);
    if (entry.reason) parts.push(`- ${entry.reason}`);
    return `  ${parts.join(' ')}`;
  };
  log(`Quarantine (${rel}): ${list.entries.length} active, ${list.expired.length} expired`);
  for (const entry of list.entries) log(describe(entry));
  if (list.expired.length) {
    log('\nExpired (no longer skipped):');
    for (const entry of list.expired) log(describe(entry));
  }
  return 0;
}
