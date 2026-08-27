import { Command } from 'commander';
import { runInit } from './init';
import { runReport } from './report';
import { runTestCommand } from './test';
import { runClean } from './clean';
import { runGenerate } from './generate';
import { runCi } from './ci';
import { runDoctor } from './doctor';
import { runStepsCommand } from './steps';

export function createCli(): Command {
  const program = new Command();

  program
    .name('testfly')
    .description('TestFly Playwright — Zero-boilerplate BDD & test automation framework')
    .version('0.1.0');

  program
    .command('init')
    .description('Initialize a new TestFly Playwright project with BDD, fixtures, and config')
    .option('-f, --force', 'Overwrite existing template files')
    .action(async (options) => {
      await runInit({ force: options.force });
    });

  program
    .command('doctor')
    .description('Diagnose project health, configuration, browsers, and BDD step mappings')
    .action(async () => {
      await runDoctor();
    });

  program
    .command('steps')
    .description('Audit unmapped BDD steps and auto-generate TypeScript definitions')
    .option('-s, --scaffold', 'Auto-generate missing step definitions to steps/unmapped.steps.ts')
    .option('-f, --features <dir>', 'Custom features directory')
    .option('-t, --steps <dir>', 'Custom steps directory')
    .action(async (options) => {
      await runStepsCommand(options);
    });

  program
    .command('clean')
    .description('Clean all generated reports, test results, and BDD artifacts (like mvn clean)')
    .action(async () => {
      await runClean();
    });

  program
    .command('generate')
    .description('Generate BDD features and steps from OpenAPI / Swagger spec')
    .option('-s, --swagger <pathOrUrl>', 'Swagger / OpenAPI JSON/YAML file path or URL')
    .option('-o, --output-dir <dir>', 'Output directory for feature files (default: features)')
    .action(async (options) => {
      await runGenerate(options);
    });

  program
    .command('ci [provider]')
    .description('Generate CI/CD pipeline template (github, gitlab)')
    .option('-f, --force', 'Overwrite existing pipeline configuration')
    .action(async (provider, options) => {
      await runCi({ provider, force: options.force });
    });

  program
    .command('test')
    .description('Run BDD and Playwright tests')
    .option('--clean', 'Clean test results and reports before running tests')
    .option('--ui', 'Open Playwright interactive UI mode')
    .option('--headed', 'Run browser in headed mode')
    .option('-p, --project <name>', 'Filter by project name (e.g. bdd-tests, spec-tests)')
    .option('-g, --grep <pattern>', 'Filter tests by tag or title pattern (e.g. @smoke)')
    .option('-t, --tags <pattern>', 'Alias for --grep (filter by Cucumber tags)')
    .option('-r, --reporter <name>', 'Playwright reporter to use')
    .option('-c, --config <path>', 'Custom playwright config path')
    .option('-w, --workers <count>', 'Number of concurrent workers')
    .action(async (options) => {
      await runTestCommand(options);
    });

  program
    .command('report [type]')
    .description('Open or serve test reports (Playwright, Allure, Cucumber)')
    .option('-a, --allure', 'Open / serve Allure report dashboard')
    .option('-c, --cucumber', 'Open Cucumber HTML report')
    .option('-g, --generate', 'Generate static Allure report instead of live server')
    .option('-p, --port <port>', 'Port number for report server')
    .option('-o, --output-dir <dir>', 'Custom output directory of report results')
    .action(async (type, options) => {
      await runReport(type, options);
    });

  return program;
}

export * from './init';
export * from './report';
export * from './test';
export * from './clean';
export * from './generate';
export * from './ci';
export * from './doctor';
export * from './steps';


