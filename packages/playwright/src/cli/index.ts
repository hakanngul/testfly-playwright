import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';

function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Set the process exit code from a command result (non-zero only). */
function finish(code: number | void): void {
  if (typeof code === 'number' && code !== 0) process.exitCode = code;
}

const toInt = (value: string): number => Number.parseInt(value, 10);

/**
 * Build the `testfly` command line. Command implementations are loaded lazily so that
 * `testfly --help` stays fast.
 *
 * @internal
 */
export function createCli(): Command {
  const program = new Command();
  program.name('testfly').description('TestFly for Playwright: BDD, typed locators, self-healing and stability analytics').version(readVersion());

  program
    .command('init')
    .description('Scaffold config, example tests, locators and .gitignore entries in the current directory')
    .option('-f, --force', 'overwrite existing files')
    .option('--no-bdd', 'skip the BDD example (features/steps)')
    .action(async (options: { force?: boolean; bdd?: boolean }) => {
      const { runInit } = await import('./init');
      await runInit({ force: options.force, bdd: options.bdd });
    });

  program
    .command('doctor')
    .description('Diagnose the project: Node, Playwright, config, locators and BDD steps')
    .action(async () => {
      const { runDoctor } = await import('./doctor');
      finish(await runDoctor());
    });

  program
    .command('locators')
    .description('Generate typed locator keys (locators/index.d.ts) from the YAML catalog')
    .option('-d, --dir <dir>', 'locators directory', 'locators')
    .option('-o, --output <file>', 'output .d.ts file')
    .action(async (options: { dir?: string; output?: string }) => {
      const { runLocatorsCommand } = await import('./locators');
      finish(await runLocatorsCommand(options));
    });

  program
    .command('steps')
    .description('Find feature steps without a step definition')
    .option('-s, --scaffold', 'write stubs to steps/unmapped.steps.ts')
    .option('-f, --features <dir>', 'features directory', 'features')
    .option('-t, --steps <dir>', 'steps directory', 'steps')
    .action(async (options: { scaffold?: boolean; features?: string; steps?: string }) => {
      const { runStepsCommand } = await import('./steps');
      finish(await runStepsCommand(options));
    });

  program
    .command('generate')
    .description('Generate BDD features and API steps from an OpenAPI/Swagger document')
    .option('-s, --swagger <pathOrUrl>', 'OpenAPI JSON/YAML file or URL')
    .option('-o, --output-dir <dir>', 'feature output directory', 'features')
    .action(async (options: { swagger?: string; outputDir?: string }) => {
      const { runGenerate } = await import('./generate');
      finish(await runGenerate(options));
    });

  program
    .command('clean')
    .description('Remove generated artifacts (.features-gen, test-results, reports)')
    .option('--all', 'also remove run history (.testfly/history)')
    .action(async (options: { all?: boolean }) => {
      const { runClean } = await import('./clean');
      await runClean(options);
    });

  program
    .command('test [playwrightArgs...]')
    .description('Generate BDD tests (if used) and run Playwright. Extra arguments are passed to `playwright test`.')
    .allowUnknownOption()
    .option('--clean', 'clean artifacts first')
    .option('--ui', 'Playwright UI mode')
    .option('--headed', 'run browsers headed')
    .option('-p, --project <name>', 'project name')
    .option('-g, --grep <pattern>', 'only tests matching the pattern (e.g. @smoke)')
    .option('-r, --reporter <name>', 'reporter override')
    .option('-c, --config <path>', 'Playwright config path')
    .option('-w, --workers <count>', 'number of workers')
    .option('--no-bdd', 'skip BDD generation')
    .action(async (playwrightArgs: string[], options: Record<string, string | boolean | undefined>) => {
      const { runTestCommand } = await import('./test');
      finish(await runTestCommand({ ...options, passthrough: playwrightArgs }));
    });

  program
    .command('shard')
    .description('Print the test files of one duration-balanced shard (uses run history)')
    .requiredOption('--total <n>', 'total number of shards', toInt)
    .requiredOption('--index <i>', 'shard index, 1-based', toInt)
    .option('--history <dir>', 'history directory', '.testfly/history')
    .option('--format <format>', 'files | json', 'files')
    .option('-c, --config <path>', 'Playwright config path')
    .action(async (options: { total: number; index: number; history?: string; format?: string; config?: string }) => {
      const { runShard } = await import('./shard');
      const format = options.format === 'json' ? 'json' : 'files';
      finish(await runShard({ total: options.total, index: options.index, history: options.history, format, config: options.config }));
    });

  const quarantine = program.command('quarantine').description('Inspect the quarantine list');
  quarantine
    .command('list')
    .description('List active and expired quarantine entries')
    .option('-f, --file <file>', 'quarantine file', 'testfly-quarantine.yml')
    .action(async (options: { file?: string }) => {
      const { runQuarantineList } = await import('./quarantine');
      finish(await runQuarantineList(options));
    });

  program
    .command('report [type]')
    .description('Open the TestFly dashboard (default) or the Playwright HTML report ("html")')
    .option('-o, --output-dir <dir>', 'TestFly reporter output directory', '.testfly')
    .action(async (type: string | undefined, options: { outputDir?: string }) => {
      const { runReport } = await import('./report');
      finish(await runReport(type, options));
    });

  program
    .command('ci [provider]')
    .description('Write a CI pipeline (github | gitlab)')
    .option('-f, --force', 'overwrite an existing pipeline file')
    .option('--pm <manager>', 'npm | pnpm | yarn (default: detected)')
    .option('--shards <n>', 'number of shards (GitHub only)', toInt)
    .action(async (provider: string | undefined, options: { force?: boolean; pm?: 'npm' | 'pnpm' | 'yarn'; shards?: number }) => {
      const { runCi } = await import('./ci');
      finish(await runCi({ provider, ...options }));
    });

  return program;
}
