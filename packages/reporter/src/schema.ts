import { z } from 'zod';

/**
 * TestFly data contract (ADR-001 D4) — version 1.
 *
 * Workers communicate with @testfly/reporter only through Playwright attachments
 * (`testInfo.attach(name, { body, contentType })`) using the content types below.
 * The reporter aggregates them into {@link RunRecord} files under
 * `<outputDir>/history/run-<timestamp>.v1.json`. Every analytic feature
 * (Flakiness Radar, Smart Triage, Quality Gate, LPT sharder, AI failure analysis,
 * dashboard) reads ONLY this schema.
 *
 * Breaking changes require a new major schema version (v2) and a migration.
 *
 * @public
 */

export const SCHEMA_VERSION = 1 as const;

export const CONTENT_TYPES = {
  heal: 'application/vnd.testfly.heal+json',
  step: 'application/vnd.testfly.step+json',
  api: 'application/vnd.testfly.api+json',
  ai: 'application/vnd.testfly.ai+json',
  meta: 'application/vnd.testfly.meta+json',
} as const;

export type TestFlyContentType = (typeof CONTENT_TYPES)[keyof typeof CONTENT_TYPES];

/** A locator that was recovered by a healing strategy. */
export const HealEventSchema = z.object({
  key: z.string(),
  original: z.string(),
  healed: z.string(),
  strategy: z.string(),
  confidence: z.number().min(0).max(1),
  url: z.string().optional(),
  timestamp: z.number(),
});
export type HealEvent = z.infer<typeof HealEventSchema>;

/**
 * Free-form metadata attached with {@link CONTENT_TYPES}.meta. All fields optional (additive contract).
 * `analysis` (markdown) is copied into {@link TestRecord.analysis}.
 */
export const MetaEventSchema = z
  .object({
    analysis: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();
export type MetaEvent = z.infer<typeof MetaEventSchema>;

/** A named step logged through the `step` fixture. */
export const StepEventSchema = z.object({
  title: z.string(),
  level: z.enum(['info', 'pass', 'warn', 'fail']),
  offsetMs: z.number(),
  details: z.unknown().optional(),
});
export type StepEvent = z.infer<typeof StepEventSchema>;

/** A single HTTP exchange performed by the `api` fixture. */
export const ApiEventSchema = z.object({
  method: z.string(),
  url: z.string(),
  status: z.number(),
  durationMs: z.number(),
  attempt: z.number().int().default(1),
  requestBody: z.string().optional(),
  responseBody: z.string().optional(),
  curl: z.string().optional(),
});
export type ApiEvent = z.infer<typeof ApiEventSchema>;

/** Usage of an AI feature (cache hit/miss, tokens) — used for cost reporting. */
export const AiEventSchema = z.object({
  feature: z.enum(['act', 'byIntent', 'assert', 'heal', 'analysis']),
  goal: z.string(),
  cache: z.enum(['hit', 'miss', 'knowledge']),
  provider: z.string().optional(),
  model: z.string().optional(),
  inputTokens: z.number().int().optional(),
  outputTokens: z.number().int().optional(),
  durationMs: z.number(),
});
export type AiEvent = z.infer<typeof AiEventSchema>;

export const TriageCategorySchema = z.enum(['SYSTEM_FLAKY', 'APPLICATION_BUG', 'TEST_BUG', 'NEEDS_INVESTIGATION']);
export type TriageCategory = z.infer<typeof TriageCategorySchema>;

export const RiskLevelSchema = z.enum(['STABLE', 'WATCH', 'HIGH']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const TestStatusSchema = z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);

/** One test (all retries aggregated) inside a run. */
export const TestRecordSchema = z.object({
  /** Stable id: `<project>::<file>::<titlePath joined by ' › '>` */
  id: z.string(),
  title: z.string(),
  titlePath: z.array(z.string()),
  file: z.string(),
  line: z.number().int().optional(),
  project: z.string(),
  tags: z.array(z.string()).default([]),
  status: TestStatusSchema,
  /** passed only after a retry */
  flaky: z.boolean(),
  quarantined: z.boolean().default(false),
  /** Reason from the `quarantine` annotation, if any (additive field). */
  quarantineReason: z.string().optional(),
  retries: z.number().int(),
  durationMs: z.number(),
  error: z
    .object({
      message: z.string(),
      stack: z.string().optional(),
      snippet: z.string().optional(),
    })
    .optional(),
  triage: TriageCategorySchema.optional(),
  heals: z.array(HealEventSchema).default([]),
  steps: z.array(StepEventSchema).default([]),
  api: z.array(ApiEventSchema).default([]),
  ai: z.array(AiEventSchema).default([]),
  /** Paths (relative to outputDir) of screenshots/videos/traces. */
  artifacts: z.array(z.object({ name: z.string(), path: z.string(), contentType: z.string() })).default([]),
  /** AI failure analysis (markdown) if enabled. */
  analysis: z.string().optional(),
});
export type TestRecord = z.infer<typeof TestRecordSchema>;

export const CiMetadataSchema = z.object({
  provider: z.string(),
  buildId: z.string().optional(),
  buildNumber: z.string().optional(),
  buildUrl: z.string().optional(),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  pullRequest: z.string().optional(),
  repository: z.string().optional(),
  actor: z.string().optional(),
  jobName: z.string().optional(),
});
export type CiMetadata = z.infer<typeof CiMetadataSchema>;

export const RunRecordSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  runId: z.string(),
  startedAt: z.number(),
  durationMs: z.number(),
  status: z.enum(['passed', 'failed', 'timedout', 'interrupted']),
  env: z.string().optional(),
  playwrightVersion: z.string().optional(),
  testflyVersion: z.string().optional(),
  shard: z.object({ current: z.number().int(), total: z.number().int() }).optional(),
  ci: CiMetadataSchema.optional(),
  totals: z.object({
    total: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
    flaky: z.number().int(),
    skipped: z.number().int(),
    quarantined: z.number().int(),
    healed: z.number().int(),
  }),
  tests: z.array(TestRecordSchema),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

/** Per-test stability computed across history. */
export const FlakinessEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  runs: z.number().int(),
  failures: z.number().int(),
  flakyRuns: z.number().int(),
  failureRate: z.number(),
  risk: RiskLevelSchema,
  avgDurationMs: z.number(),
});
export type FlakinessEntry = z.infer<typeof FlakinessEntrySchema>;

/** Helper used by workers to build attachments in the right shape. */
export function toAttachment<T>(contentType: TestFlyContentType, payload: T): { body: Buffer; contentType: string } {
  return { body: Buffer.from(JSON.stringify(payload)), contentType };
}
