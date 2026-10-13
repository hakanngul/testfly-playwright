import { DoctorService } from './doctor/DoctorService';
import { log } from './util';

/** Options of `testfly doctor`. @internal */
export interface DoctorOptions {
  cwd?: string;
}

/** Print diagnostics. Returns exit code 1 when a check failed. @internal */
export async function runDoctor(options: DoctorOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  log(`\nTestFly doctor (${cwd})\n`);
  const checks = await DoctorService.diagnose(cwd);
  const label = { pass: 'ok  ', warn: 'warn', fail: 'FAIL' } as const;
  for (const check of checks) {
    log(`  [${label[check.status]}] ${check.name}: ${check.message}`);
    if (check.solution && check.status !== 'pass') log(`         fix: ${check.solution}`);
  }
  const failed = checks.some((c) => c.status === 'fail');
  const warned = checks.some((c) => c.status === 'warn');
  log(failed ? '\nSome checks failed.\n' : warned ? '\nReady, with warnings.\n' : '\nAll good.\n');
  return failed ? 1 : 0;
}
