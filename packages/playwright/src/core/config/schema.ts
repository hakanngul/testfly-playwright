import { z } from 'zod';

/**
 * TestFly options schema (ADR-001 D2).
 *
 * These options live inside the Playwright config under the `testfly` key
 * (`defineConfig({ testfly: {...} })`) and reach tests through the worker-scoped
 * option fixture `testfly`. Projects may override them via `use: { testfly: {...} }`.
 *
 * NOTE (zod v4): use `.prefault({})` – not `.default({})` – for nested objects so that
 * inner defaults are applied.
 *
 * @public
 */

export const TimeoutsSchema = z.object({
  /** Default timeout for TestFly helpers that poll (mail, api.pollUntil, db.waitFor). */
  poll: z.number().int().positive().default(30_000),
  /** Interval between polls. */
  pollInterval: z.number().int().positive().default(500),
});

export const ApiOptionsSchema = z.object({
  baseUrl: z.string().optional(),
  headers: z.record(z.string(), z.string()).default({}),
  retry: z
    .object({
      attempts: z.number().int().min(0).default(0),
      backoffMs: z.number().int().min(0).default(300),
      onStatus: z.array(z.number().int()).default([502, 503, 504]),
      onNetworkError: z.boolean().default(true),
    })
    .prefault({}),
  /** Log request/response bodies as step attachments. */
  logBodies: z.boolean().default(true),
  /** Max characters of a body kept in logs/attachments. */
  truncateAt: z.number().int().positive().default(2_000),
});

export const DbOptionsSchema = z.object({
  /** `mock` is an explicit in-memory store. It is never used implicitly. */
  client: z.enum(['postgres', 'mysql', 'mock']),
  connectionString: z.string().optional(),
  pool: z.object({ max: z.number().int().positive().default(5) }).prefault({}),
});

export const RedisOptionsSchema = z.object({
  url: z.string(),
});

export const MailOptionsSchema = z.object({
  /** `mock` is explicit; `waitForEmail` on mock only returns mails delivered with `mail.mock.deliver()`. */
  provider: z.enum(['mailpit', 'mailtrap', 'imap', 'mock']),
  url: z.string().optional(),
  apiKey: z.string().optional(),
  accountId: z.string().optional(),
  inboxId: z.string().optional(),
  imap: z
    .object({
      host: z.string(),
      port: z.number().int().default(993),
      secure: z.boolean().default(true),
      user: z.string(),
      pass: z.string(),
      mailbox: z.string().default('INBOX'),
    })
    .optional(),
});

export const SessionOptionsSchema = z.object({
  /** Directory where per-role storage states are cached. */
  dir: z.string().default('.testfly/sessions'),
  /** Max age before a cached session is recreated. 0 = only reuse within the same run. */
  maxAgeMinutes: z.number().int().min(0).default(0),
});

export const HealingOptionsSchema = z.object({
  /**
   * off   – no healing
   * rules – YAML fallbacks + rule-based + fuzzy healing (zero tokens)
   * ai    – rules first, then @testfly/ai (requires the package)
   */
  mode: z.enum(['off', 'rules', 'ai']).default('rules'),
  /** Fail the test (after it passes) when any locator healed. Useful for strict pipelines. */
  failOnHeal: z.boolean().default(false),
  /** Minimum similarity (0..1) accepted by the fuzzy engine. */
  fuzzyThreshold: z.number().min(0).max(1).default(0.75),
});

export const AiOptionsSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini', 'openai-compatible']).default('anthropic'),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  /**
   * live    – call the LLM on cache miss and write the cache
   * replay  – never call the LLM; a cache miss fails the test (recommended on CI)
   * off     – AI features throw TF_FEATURE_DISABLED
   */
  mode: z.enum(['live', 'replay', 'off']).default('live'),
  cacheDir: z.string().default('.testfly'),
  timeoutMs: z.number().int().positive().default(30_000),
  maxTokens: z.number().int().positive().default(1_024),
  /** Max characters of aria snapshot / DOM sent to the model. */
  maxContextChars: z.number().int().positive().default(24_000),
  failureAnalysis: z.boolean().default(false),
  /** Extra regexes whose matches are redacted before anything leaves the machine. */
  redact: z.array(z.string()).default([]),
});

export const ConsoleErrorsOptionsSchema = z.object({
  /**
   * off    – do not listen
   * report – attach the errors to the test (shown in the TestFly dashboard)
   * fail   – also fail a test that otherwise passed when the page logged errors
   */
  mode: z.enum(['off', 'report', 'fail']).default('report'),
  /** Regexes (strings) for errors to ignore, matched against the message. */
  ignore: z.array(z.string()).default([]),
  /** Also collect `console.error` calls, not only uncaught exceptions (`pageerror`). */
  includeConsole: z.boolean().default(true),
});

export const LocatorsOptionsSchema = z.object({
  /** Directory with YAML locator catalogs. */
  dir: z.string().default('locators'),
});

export const BddOptionsSchema = z.object({
  features: z.union([z.string(), z.array(z.string())]).default('features/**/*.feature'),
  steps: z.union([z.string(), z.array(z.string())]).default(['steps/**/*.ts']),
  outputDir: z.string().optional(),
  /**
   * Module whose `test` the generated specs import. Default `@testfly/playwright/bdd`;
   * native mobile suites use `@testfly/mobile/bdd`.
   */
  importTestFrom: z.string().optional(),
});

/**
 * Native mobile options used by `@testfly/mobile` (Mobilewright + mobilecli). Optional: web/API
 * projects leave it out. Per-project overrides go in `use.testfly.mobile` (e.g. one project per platform).
 */
export const MobileOptionsSchema = z.object({
  platform: z.enum(['ios', 'android']),
  /** App launched before each test (iOS bundle id / Android package). */
  bundleId: z.string().optional(),
  /** Terminate and relaunch `bundleId` before each test. Default true. */
  autoAppLaunch: z.boolean().default(true),
  /** `.app`/`.ipa`/`.apk` file(s) installed before the first test. */
  installApps: z.union([z.string(), z.array(z.string())]).optional(),
  deviceId: z.string().optional(),
  /** Regex (string) matched against the device name, e.g. `iPhone 16`. */
  deviceName: z.string().optional(),
  /** mobilecli server URL. Default: mobilecli's own (`http://localhost:12000`), started when needed. */
  url: z.string().optional(),
  /** Start the local mobilecli server when it is not running. Default true. */
  autoStart: z.boolean().default(true),
  /** Turn device animations off for stabler runs. */
  animations: z.enum(['on', 'off']).optional(),
  timeouts: z
    .object({
      connect: z.number().int().positive().optional(),
      action: z.number().int().positive().optional(),
      expect: z.number().int().positive().optional(),
      appLaunch: z.number().int().positive().optional(),
      install: z.number().int().positive().optional(),
    })
    .prefault({}),
  /** Attach a device screenshot when a test fails. Default true. */
  screenshotOnFailure: z.boolean().default(true),
});

export const ReporterOptionsSchema = z.object({
  /** Add @testfly/reporter automatically. */
  enabled: z.boolean().default(true),
  outputDir: z.string().default('.testfly'),
  quarantineFile: z.string().default('testfly-quarantine.yml'),
  historySize: z.number().int().positive().default(20),
  qualityGate: z
    .object({
      minPassRate: z.number().min(0).max(100).optional(),
      maxFlaky: z.number().int().min(0).optional(),
      failOnHighFlakiness: z.boolean().default(false),
      failOnHeal: z.boolean().default(false),
    })
    .prefault({}),
  /**
   * Chat notifications at the end of the run. Webhook URLs usually come from env placeholders,
   * e.g. `slack: '${SLACK_WEBHOOK_URL}'`. Nothing is sent when no URL is set.
   */
  notifications: z
    .object({
      slack: z.string().optional(),
      teams: z.string().optional(),
      discord: z.string().optional(),
      /** `failure` (default): only failed runs / quality gates; `always`: every run. */
      on: z.enum(['always', 'failure']).default('failure'),
      title: z.string().optional(),
      reportUrl: z.string().optional(),
    })
    .optional(),
  /**
   * Push results of tagged tests to TestRail (`@C1234`) and/or Xray Cloud (`@PROJ-123`) at the end of
   * the run. Keep credentials in env placeholders (`'${TESTRAIL_API_KEY}'`).
   */
  testManagement: z
    .object({
      testrail: z
        .object({
          url: z.string(),
          user: z.string(),
          apiKey: z.string(),
          runId: z.number().int().positive().optional(),
          projectId: z.number().int().positive().optional(),
          suiteId: z.number().int().positive().optional(),
          runName: z.string().optional(),
          closeRun: z.boolean().default(false),
        })
        .refine((t) => t.runId !== undefined || t.projectId !== undefined, { message: 'testrail needs runId or projectId' })
        .optional(),
      xray: z
        .object({
          clientId: z.string(),
          clientSecret: z.string(),
          projectKey: z.string().optional(),
          testExecutionKey: z.string().optional(),
          testPlanKey: z.string().optional(),
          summary: z.string().optional(),
          baseUrl: z.string().optional(),
        })
        .refine((x) => x.projectKey !== undefined || x.testExecutionKey !== undefined, { message: 'xray needs projectKey or testExecutionKey' })
        .optional(),
    })
    .optional(),
});

/**
 * Master on/off switches (ported from TestFly's `features:` panel). A disabled feature wins over its
 * own options: `healing: false` forces `healing.mode = 'off'`, `ai: false` forces `ai.mode = 'off'`,
 * `reporter: false` drops @testfly/reporter, `notifications: false` drops `reporter.notifications`,
 * `consoleErrors: false` forces `consoleErrors.mode = 'off'` and `quarantine: false` runs quarantined tests.
 */
/** k6 load tests run by the `load` fixture. k6 itself is installed by the user. */
export const LoadOptionsSchema = z.object({
  /** k6 command; a full path when it is not on PATH. */
  k6Path: z.string().min(1).default('k6'),
  /** Upper bound of one `load.run()`, k6 start-up and summary included. */
  timeoutMs: z.number().int().positive().default(600_000),
});

export const FeaturesSchema = z.object({
  healing: z.boolean().default(true),
  ai: z.boolean().default(true),
  quarantine: z.boolean().default(true),
  consoleErrors: z.boolean().default(true),
  reporter: z.boolean().default(true),
  notifications: z.boolean().default(true),
});

export const TestFlyOptionsSchema = z.object({
  baseUrl: z.string().optional(),
  /** Free-form environment label shown in reports (local, dev, staging…). */
  env: z.string().default('local'),
  timeouts: TimeoutsSchema.prefault({}),
  api: ApiOptionsSchema.prefault({}),
  db: DbOptionsSchema.optional(),
  redis: RedisOptionsSchema.optional(),
  mail: MailOptionsSchema.optional(),
  session: SessionOptionsSchema.prefault({}),
  locators: LocatorsOptionsSchema.prefault({}),
  healing: HealingOptionsSchema.prefault({}),
  consoleErrors: ConsoleErrorsOptionsSchema.prefault({}),
  ai: AiOptionsSchema.prefault({}),
  bdd: BddOptionsSchema.optional(),
  mobile: MobileOptionsSchema.optional(),
  load: LoadOptionsSchema.prefault({}),
  reporter: ReporterOptionsSchema.prefault({}),
  features: FeaturesSchema.prefault({}),
  /**
   * Named overrides applied when `env` (or `TESTFLY_ENV`) matches the key, e.g.
   * `profiles: { ci: { ai: { mode: 'replay' } } }`. Deep-merged over the root options.
   */
  profiles: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  /** User-defined values available as `testfly.custom`. */
  custom: z.record(z.string(), z.unknown()).default({}),
});

/** Fully resolved options (after defaults). @public */
export type TestFlyOptions = z.infer<typeof TestFlyOptionsSchema>;
/** What users write in config (defaults optional). @public */
export type TestFlyOptionsInput = z.input<typeof TestFlyOptionsSchema>;

export type ApiOptions = z.infer<typeof ApiOptionsSchema>;
export type DbOptions = z.infer<typeof DbOptionsSchema>;
export type MailOptions = z.infer<typeof MailOptionsSchema>;
export type HealingOptions = z.infer<typeof HealingOptionsSchema>;
export type AiOptions = z.infer<typeof AiOptionsSchema>;
export type ReporterOptions = z.infer<typeof ReporterOptionsSchema>;
export type SessionOptions = z.infer<typeof SessionOptionsSchema>;
export type ConsoleErrorsOptions = z.infer<typeof ConsoleErrorsOptionsSchema>;
export type FeatureFlags = z.infer<typeof FeaturesSchema>;
export type MobileOptions = z.infer<typeof MobileOptionsSchema>;
export type LoadOptions = z.infer<typeof LoadOptionsSchema>;
