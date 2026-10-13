import path from 'node:path';
import { captureNode, findPlaywrightConfig, playwrightCli, runBddgen, usesBdd, warn } from './util';

/** Options of `testfly shard`. @internal */
export interface ShardOptions {
  /** Total number of shards. */
  total: number;
  /** 1-based shard index (as in `--shard=index/total`). */
  index: number;
  /** Directory with run history written by @testfly/reporter. */
  history?: string;
  format?: 'files' | 'json';
  config?: string;
  /** Explicit list of test files (skips discovery). */
  testFiles?: string[];
  cwd?: string;
}

interface JsonSuite {
  file?: string;
  suites?: JsonSuite[];
}

interface JsonReport {
  config?: { rootDir?: string };
  suites?: JsonSuite[];
}

function collectFiles(suites: JsonSuite[], into: Set<string>): void {
  for (const suite of suites) {
    if (suite.file) into.add(suite.file);
    if (suite.suites) collectFiles(suite.suites, into);
  }
}

/** Discover test files via `playwright test --list --reporter=json`. @internal */
export async function discoverTestFiles(cwd: string, config?: string): Promise<string[]> {
  const configFile = findPlaywrightConfig(cwd, config);
  if (usesBdd(configFile)) {
    const code = await runBddgen(cwd, configFile);
    if (code !== 0) throw new Error(`bddgen failed with exit code ${code}`);
  }
  const args = ['test', '--list', '--reporter=json', ...(config ? ['--config', config] : [])];
  const { code, stdout, stderr } = await captureNode(playwrightCli(cwd), args, cwd);
  const start = stdout.indexOf('{');
  if (start < 0) {
    throw new Error(`playwright --list produced no JSON (exit ${code}).\n${stderr.trim()}`);
  }
  let report: JsonReport;
  try {
    report = JSON.parse(stdout.slice(start)) as JsonReport;
  } catch (cause) {
    throw new Error(`Could not parse the output of "playwright test --list": ${(cause as Error).message}`);
  }
  const rootDir = report.config?.rootDir ?? cwd;
  const files = new Set<string>();
  collectFiles(report.suites ?? [], files);
  return [...files].map((file) => path.relative(cwd, path.resolve(rootDir, file)).split(path.sep).join('/')).sort();
}

/** Plan a duration-balanced shard and print it. Returns the exit code. @internal */
export async function runShard(options: ShardOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  if (!Number.isInteger(options.total) || options.total < 1 || !Number.isInteger(options.index) || options.index < 1 || options.index > options.total) {
    warn('--total must be >= 1 and --index must be between 1 and --total.');
    return 2;
  }
  const testFiles = options.testFiles ?? (await discoverTestFiles(cwd, options.config));
  if (testFiles.length === 0) {
    warn('No test files found.');
    return 1;
  }
  const { planShards } = await import('@testfly/reporter');
  const plan = planShards({
    historyDir: path.resolve(cwd, options.history ?? '.testfly/history'),
    total: options.total,
    index: options.index,
    testFiles,
  });
  if (options.format === 'json') {
    process.stdout.write(`${JSON.stringify({ index: options.index, total: options.total, files: plan.files, estimatedMs: plan.estimatedMs }, null, 2)}\n`);
  } else {
    process.stdout.write(plan.files.length ? `${plan.files.join('\n')}\n` : '');
  }
  return 0;
}
