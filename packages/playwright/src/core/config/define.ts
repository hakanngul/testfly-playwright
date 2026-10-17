import path from 'node:path';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { defineConfig as pwDefineConfig, type PlaywrightTestConfig, type ReporterDescription } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { TestFlyError } from '../errors';
import { parseTestFlyOptions } from './parse';
import { deepMerge } from './merge';
import type { TestFlyOptions, TestFlyOptionsInput } from './schema';

/** Recursive partial used for per-project `use.testfly` overrides. @public */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** Per-project (or root) `use` options contributed by TestFly. @public */
export interface TestFlyUseOptions {
  /** Overrides merged over the root `testfly` options for this project. */
  testfly?: DeepPartial<TestFlyOptionsInput>;
}

/**
 * Playwright config accepted by {@link defineConfig}: a regular Playwright config plus a
 * top-level `testfly` key and `use.testfly` overrides in projects.
 *
 * @public
 */
export type TestFlyConfig = PlaywrightTestConfig<{}, TestFlyUseOptions> & {
  testfly?: TestFlyOptionsInput;
};

// `__filename` is shimmed by tsup for the ESM build, so this works in both module formats.
const nodeRequire = createRequire(__filename);

/** Resolve a module of this package, preferring the consumer's installation. */
function resolveSelf(specifier: string, distFile: string): string {
  const attempts: Array<() => string> = [
    () => nodeRequire.resolve(specifier, { paths: [process.cwd()] }),
    () => nodeRequire.resolve(specifier),
    () => {
      for (const ext of ['.js', '.mjs', '.cjs']) {
        const candidate = path.join(__dirname, `${distFile}${ext}`);
        if (fs.existsSync(candidate)) return candidate;
      }
      throw new Error('not found');
    },
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      /* try next */
    }
  }
  return specifier;
}

function resolveReporter(): string {
  try {
    return nodeRequire.resolve('@testfly/reporter', { paths: [process.cwd(), __dirname] });
  } catch (cause) {
    throw new TestFlyError('TF_CONFIG_INVALID', 'testfly.reporter.enabled is true but @testfly/reporter cannot be resolved.', {
      hint: 'Install @testfly/reporter or set testfly.reporter.enabled to false.',
      cause,
    });
  }
}

function isTestFlyReporter(entry: ReporterDescription | string): boolean {
  const name = Array.isArray(entry) ? entry[0] : entry;
  return typeof name === 'string' && name.includes('@testfly/reporter');
}

function applyReporters(config: PlaywrightTestConfig<{}, TestFlyUseOptions>, options: TestFlyOptions): ReporterDescription[] | string | undefined {
  const existing = config.reporter;
  if (!options.reporter.enabled) return existing as ReporterDescription[] | string | undefined;

  let list: ReporterDescription[];
  if (existing === undefined) {
    list = [['list'], ['html', { open: 'never' }]];
  } else if (typeof existing === 'string') {
    list = [[existing] as unknown as ReporterDescription];
  } else {
    list = [...existing];
  }
  if (list.some((entry) => isTestFlyReporter(entry as ReporterDescription))) return list;

  const { outputDir, quarantineFile, historySize, qualityGate, notifications, testManagement } = options.reporter;
  list.push([resolveReporter(), { outputDir, quarantineFile, historySize, qualityGate, notifications, testManagement, env: options.env }]);
  return list;
}

/**
 * Define a Playwright config with TestFly options.
 *
 * - validates `testfly` with zod and exposes the result to tests as the worker option fixture `testfly`
 * - deep-merges per-project `use.testfly` overrides over the root options
 * - resolves `${VAR}` placeholders (process env and `.env`) and the `TESTFLY_ENV` profile
 * - sets `use.baseURL` from `testfly.baseUrl` when missing
 * - wires playwright-bdd when `testfly.bdd` is set, and `@testfly/reporter` when enabled
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   testfly: { baseUrl: 'https://app.example.com', ai: { mode: 'replay' } },
 *   projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
 * });
 * ```
 *
 * @throws TestFlyError `TF_CONFIG_INVALID` for invalid options or missing env variables.
 * @public
 */
export function defineConfig(config: TestFlyConfig = {}): PlaywrightTestConfig {
  const { testfly: rawOptions, ...playwrightConfig } = config;
  const root = parseTestFlyOptions(rawOptions, undefined, 'testfly');

  // A run-wide timestamp shared with workers (they inherit the environment of the main process).
  process.env.TESTFLY_RUN_STARTED ||= String(Date.now());

  const baseUse = (playwrightConfig.use ?? {}) as Record<string, unknown>;
  const use: Record<string, unknown> = { ...baseUse, testfly: parseTestFlyOptions(rawOptions, baseUse.testfly, 'use.testfly') };
  if (root.baseUrl && baseUse.baseURL === undefined) use.baseURL = root.baseUrl;

  const projects = playwrightConfig.projects?.map((project) => {
    const projectUse = (project.use ?? {}) as Record<string, unknown>;
    const nextUse: Record<string, unknown> = { ...projectUse };
    const resolved = parseTestFlyOptions(rawOptions, mergeProjectOverride(baseUse.testfly, projectUse.testfly), `projects["${project.name ?? '?'}"].use.testfly`);
    nextUse.testfly = resolved;
    if (resolved.baseUrl && projectUse.baseURL === undefined && baseUse.baseURL === undefined) nextUse.baseURL = resolved.baseUrl;
    return { ...project, use: nextUse };
  });

  const out: Record<string, unknown> = { ...playwrightConfig, use };
  if (projects) out.projects = projects;

  if (root.bdd) {
    const bddDir = defineBddConfig({
      features: root.bdd.features,
      steps: root.bdd.steps,
      ...(root.bdd.outputDir ? { outputDir: root.bdd.outputDir } : {}),
      importTestFrom: resolveSelf('@testfly/playwright/bdd', 'bdd'),
      disableWarnings: { importTestFrom: true },
    });
    if (out.testDir === undefined) out.testDir = bddDir;
  }

  const reporter = applyReporters(playwrightConfig, root);
  if (reporter !== undefined) out.reporter = reporter;

  return pwDefineConfig(out as PlaywrightTestConfig);
}

function mergeProjectOverride(rootUse: unknown, projectOverride: unknown): unknown {
  if (!rootUse) return projectOverride;
  if (!projectOverride) return rootUse;
  return deepMerge(rootUse as Record<string, unknown>, projectOverride as Record<string, unknown>);
}
