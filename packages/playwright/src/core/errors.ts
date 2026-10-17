import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * TestFly error model (ADR-001 D7: honesty principle).
 *
 * Every failure raised by TestFly is a {@link TestFlyError} with a stable `code`,
 * a human readable message, an optional `hint` explaining how to fix it and a docs link.
 * Never fall back silently to fake/mock data — throw one of these instead.
 *
 * @public
 */
export type TestFlyErrorCode =
  // configuration
  | 'TF_CONFIG_INVALID'
  | 'TF_CONFIG_MISSING'
  | 'TF_CONTEXT_KEY_MISSING'
  | 'TF_DATA_FILE_INVALID'
  // optional dependencies / modules
  | 'TF_OPTIONAL_DEPENDENCY_MISSING'
  | 'TF_FEATURE_DISABLED'
  // locators & healing
  | 'TF_LOCATOR_NOT_FOUND'
  | 'TF_LOCATOR_INVALID'
  | 'TF_HEALING_FAILED'
  // api
  | 'TF_API_REQUEST_FAILED'
  | 'TF_API_ASSERTION_FAILED'
  | 'TF_API_POLL_TIMEOUT'
  | 'TF_API_SCHEMA_MISMATCH'
  // db
  | 'TF_DB_NOT_CONFIGURED'
  | 'TF_DB_QUERY_FAILED'
  | 'TF_DB_ASSERTION_FAILED'
  // mail
  | 'TF_MAIL_NOT_CONFIGURED'
  | 'TF_MAIL_TIMEOUT'
  | 'TF_MAIL_PROVIDER_ERROR'
  // mock
  | 'TF_MOCK_ASSERTION_FAILED'
  // session / auth
  | 'TF_SESSION_PROVIDER_MISSING'
  | 'TF_SESSION_SETUP_FAILED'
  // ai
  | 'TF_AI_NOT_CONFIGURED'
  | 'TF_AI_CACHE_MISS'
  | 'TF_AI_PROVIDER_ERROR'
  | 'TF_AI_INVALID_RESPONSE'
  | 'TF_AI_ASSERTION_FAILED'
  | 'TF_AI_ACTION_FAILED'
  // quality fixtures
  | 'TF_QUALITY_ASSERTION_FAILED'
  | 'TF_QUALITY_UNSUPPORTED'
  // browser console
  | 'TF_CONSOLE_ERRORS'
  // reporter / quality gates
  | 'TF_QUARANTINE_INVALID'
  | 'TF_QUALITY_GATE_FAILED'
  // generic
  | 'TF_INTERNAL';

/** @public */
export interface TestFlyErrorOptions {
  /** One sentence telling the user how to fix the problem. */
  hint?: string;
  /** Underlying error. */
  cause?: unknown;
  /** Structured, non-secret context for reports. */
  details?: Record<string, unknown>;
}

const DOCS_BASE = 'https://testfly.dev/docs/playwright/errors';

/** @public */
export class TestFlyError extends Error {
  readonly code: TestFlyErrorCode;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;
  readonly docsUrl: string;

  constructor(code: TestFlyErrorCode, message: string, options: TestFlyErrorOptions = {}) {
    const hintLine = options.hint ? `\n  → ${options.hint}` : '';
    const docsUrl = `${DOCS_BASE}#${code.toLowerCase().replace(/_/g, '-')}`;
    super(`[${code}] ${message}${hintLine}\n  ↪ ${docsUrl}`, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'TestFlyError';
    this.code = code;
    this.hint = options.hint;
    this.details = options.details;
    this.docsUrl = docsUrl;
  }
}

/** Type guard. @public */
export function isTestFlyError(err: unknown, code?: TestFlyErrorCode): err is TestFlyError {
  return err instanceof TestFlyError && (code === undefined || err.code === code);
}

/**
 * Load an optional peer dependency (pg, mysql2, ioredis, imapflow, @testfly/ai…)
 * and throw a helpful {@link TestFlyError} when it is not installed.
 *
 * @internal
 */
export async function importOptional<T = any>(moduleName: string, feature: string): Promise<T> {
  try {
    // Resolve from the consumer's project first so pnpm strict layouts work.
    let resolved = moduleName;
    try {
      resolved = createRequire(join(process.cwd(), 'noop.js')).resolve(moduleName);
    } catch {
      /* fall back to normal resolution */
    }
    const mod = await import(resolved);
    return (mod.default && Object.keys(mod).length === 1 ? mod.default : mod) as T;
  } catch (cause) {
    throw new TestFlyError('TF_OPTIONAL_DEPENDENCY_MISSING', `${feature} requires the optional package "${moduleName}".`, {
      hint: `Install it in your project: npm i -D ${moduleName}`,
      cause,
    });
  }
}
