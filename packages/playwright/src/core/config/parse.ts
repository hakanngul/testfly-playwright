import { z } from 'zod';
import { TestFlyError } from '../errors';
import { TestFlyOptionsSchema, type TestFlyOptions } from './schema';
import { collectEnvVars, resolvePlaceholders } from './env';
import { deepMerge } from './merge';

/** Format zod issues as an indented list. @internal */
export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length ? issue.path.join('.') : '(root)';
    return `${where}: ${issue.message}`;
  });
}

/**
 * Parse raw `testfly` options: apply env profile, resolve `${VAR}` placeholders,
 * validate with {@link TestFlyOptionsSchema}.
 *
 * @param raw        Root options as written by the user (may be `undefined`).
 * @param overrides  Optional per-project partial overrides (deep-merged over `raw`).
 * @param origin     Label used in error messages (e.g. `testfly` or `projects["api"].use.testfly`).
 * @internal
 */
export function parseTestFlyOptions(raw: unknown, overrides?: unknown, origin = 'testfly', cwd: string = process.cwd()): TestFlyOptions {
  const asRecord = (value: unknown, label: string): Record<string, unknown> => {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new TestFlyError('TF_CONFIG_INVALID', `${label} must be an object.`);
    }
    return value as Record<string, unknown>;
  };

  const vars = collectEnvVars(cwd);
  const root = asRecord(raw, origin);
  let merged = deepMerge(root, asRecord(overrides, `${origin} override`));

  // Environment profile: TESTFLY_ENV beats testfly.env.
  const envName = (process.env.TESTFLY_ENV || (typeof merged.env === 'string' ? merged.env : undefined) || 'local').trim();
  const profiles = merged.profiles as Record<string, Record<string, unknown>> | undefined;
  merged = { ...merged, env: envName };
  if (profiles && profiles[envName]) {
    merged = deepMerge(merged, profiles[envName]);
    merged.env = envName;
  }

  // Inactive profiles must not be resolved (they may reference variables that only exist elsewhere).
  const { profiles: _unused, ...active } = merged;
  const resolved = resolvePlaceholders(active, vars, origin);
  const result = TestFlyOptionsSchema.safeParse(resolved);
  if (!result.success) {
    const lines = formatZodIssues(result.error);
    throw new TestFlyError('TF_CONFIG_INVALID', `Invalid ${origin} options:\n${lines.map((l) => `    - ${l}`).join('\n')}`, {
      hint: 'Fix the listed options in playwright.config.ts (see https://testfly.dev/docs/playwright/config).',
      details: { issues: lines },
      cause: result.error,
    });
  }
  const { profiles: _profiles, ...options } = result.data;
  return applyFeatureFlags(options);
}

/** A disabled `features.*` switch overrides the feature's own options. @internal */
export function applyFeatureFlags(options: TestFlyOptions): TestFlyOptions {
  const f = options.features;
  return {
    ...options,
    healing: f.healing ? options.healing : { ...options.healing, mode: 'off' },
    ai: f.ai ? options.ai : { ...options.ai, mode: 'off' },
    consoleErrors: f.consoleErrors ? options.consoleErrors : { ...options.consoleErrors, mode: 'off' },
    reporter: {
      ...options.reporter,
      enabled: f.reporter && options.reporter.enabled,
      notifications: f.notifications ? options.reporter.notifications : undefined,
    },
  };
}
