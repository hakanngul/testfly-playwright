import { findPlaywrightConfig, log, playwrightCli, runBddgen, runNode, usesBdd } from './util';
import { runClean } from './clean';

/** Options of `testfly test`. @internal */
export interface TestCommandOptions {
  clean?: boolean;
  ui?: boolean;
  headed?: boolean;
  project?: string;
  grep?: string;
  reporter?: string;
  config?: string;
  workers?: string;
  /** Skip BDD generation (`--no-bdd`). */
  bdd?: boolean;
  /** Extra arguments passed through to `playwright test`. */
  passthrough?: string[];
  cwd?: string;
}

/** Run `bddgen` (when the project uses BDD) and `playwright test`. Returns the exit code. @internal */
export async function runTestCommand(options: TestCommandOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  if (options.clean) await runClean({ cwd });

  const configFile = findPlaywrightConfig(cwd, options.config);
  if (options.bdd !== false && usesBdd(configFile)) {
    log('Generating BDD tests (bddgen)...');
    const code = await runBddgen(cwd, configFile);
    if (code !== 0) return code;
  }

  const args = ['test'];
  if (options.ui) args.push('--ui');
  if (options.headed) args.push('--headed');
  if (options.project) args.push('--project', options.project);
  if (options.grep) args.push('--grep', options.grep);
  if (options.reporter) args.push('--reporter', options.reporter);
  if (options.config) args.push('--config', options.config);
  if (options.workers) args.push('--workers', options.workers);
  args.push(...(options.passthrough ?? []));

  log(`Running: playwright ${args.join(' ')}\n`);
  return runNode(playwrightCli(cwd), args, { cwd });
}
