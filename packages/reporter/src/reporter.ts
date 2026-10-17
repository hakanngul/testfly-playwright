import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestError, TestResult } from '@playwright/test/reporter';
import { applyAnalyses, readAnalysisFile } from './analysis';
import { detectCi } from './ci';
import { generateDashboard } from './dashboard';
import { computeFlakiness } from './flakiness';
import { evaluateGate, type QualityGateOptions } from './gate';
import { writeHealLog } from './healLog';
import { pruneHistory, readHistory, writeRun } from './history';
import { notifyRun, type NotificationOptions, type NotificationPayload } from './notifications';
import { syncTestManagement, type TestManagementOptions } from './testManagement';
import { loadQuarantine, matchQuarantine, type QuarantineList } from './quarantine';
import {
  ApiEventSchema,
  AiEventSchema,
  CONTENT_TYPES,
  ConsoleEventSchema,
  HealEventSchema,
  MetaEventSchema,
  RunRecordSchema,
  SCHEMA_VERSION,
  StepEventSchema,
  type AiEvent,
  type ApiEvent,
  type ConsoleEvent,
  type HealEvent,
  type RunRecord,
  type StepEvent,
  type TestRecord,
} from './schema';
import { printSummary } from './summary';
import { computeTotals, passRate } from './totals';
import { stripAnsi, triageFailure } from './triage';

/** Options of {@link TestFlyReporter}. @public */
export interface TestFlyReporterOptions {
  /** Directory for history and the report. Default `.testfly`. */
  outputDir?: string;
  /**
   * Quarantine file, resolved relative to the Playwright config directory. Default `testfly-quarantine.yml`.
   * Tests matching an entry are recorded as quarantined even without the `@testfly/playwright` fixture
   * (which skips them up front), so their failures neither count as failed nor fail the run or the quality gate.
   * A missing file means no quarantine; an invalid file is reported as a warning and ignored.
   */
  quarantineFile?: string;
  /** Number of runs kept in history and used for the Flakiness Radar. Default 20. */
  historySize?: number;
  /** Environment label stored in the run record (e.g. `staging`). */
  env?: string;
  qualityGate?: QualityGateOptions;
  /** Generate `<outputDir>/report/index.html`. Default true. */
  dashboard?: boolean;
  /** Print a console summary. Default true. */
  printSummary?: boolean;
  /** Slack / Teams / Discord messages at the end of the run (by default only when it failed). */
  notifications?: NotificationOptions;
  /** Push results of tagged tests (`@C1234` → TestRail, `@PROJ-123` → Xray Cloud) at the end of the run. */
  testManagement?: TestManagementOptions;
}

interface Accumulator {
  test: TestCase;
  results: TestResult[];
}

const TESTFLY_TYPES = new Set<string>(Object.values(CONTENT_TYPES));
const ARTIFACT_NAMES = new Set(['screenshot', 'video', 'trace']);

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

/**
 * Playwright reporter that aggregates results and TestFly attachments into a run history,
 * Flakiness Radar, triage, quality gate and a self-contained HTML dashboard.
 * Works with any Playwright project: `reporter: [['@testfly/reporter']]`.
 *
 * @public
 */
export default class TestFlyReporter implements Reporter {
  private readonly options: Required<Pick<TestFlyReporterOptions, 'outputDir' | 'quarantineFile' | 'historySize' | 'dashboard' | 'printSummary'>> &
    TestFlyReporterOptions;
  private startedAt = Date.now();
  private config?: FullConfig;
  private readonly tests = new Map<string, Accumulator>();
  private warnings = 0;
  private quarantine: QuarantineList = { entries: [], expired: [] };
  private quarantineBaseDir = process.cwd();
  private globalErrors = 0;

  constructor(options: TestFlyReporterOptions = {}) {
    this.options = {
      ...options,
      outputDir: options.outputDir ?? '.testfly',
      quarantineFile: options.quarantineFile ?? 'testfly-quarantine.yml',
      historySize: options.historySize ?? 20,
      dashboard: options.dashboard ?? true,
      printSummary: options.printSummary ?? true,
    };
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    this.startedAt = Date.now();
    this.config = config;
    this.quarantineBaseDir = config.configFile ? dirname(config.configFile) : process.cwd();
    try {
      this.quarantine = loadQuarantine(resolve(this.quarantineBaseDir, this.options.quarantineFile));
    } catch (e) {
      this.warn(`quarantine file ignored: ${(e as Error).message}`);
    }
  }

  onError(_error: TestError): void {
    this.globalErrors++;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    try {
      const id = this.testId(test);
      const acc = this.tests.get(id) ?? { test, results: [] };
      acc.test = test;
      acc.results[result.retry] = result;
      this.tests.set(id, acc);
    } catch (e) {
      this.warn(`could not record test "${test.title}": ${(e as Error).message}`);
    }
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | undefined> {
    let ret: { status?: FullResult['status'] } | undefined;
    try {
      ret = this.finish(result);
    } catch (e) {
      console.warn(`[testfly] reporter failed: ${(e as Error).stack ?? (e as Error).message}`);
      return undefined;
    }
    await this.notify();
    await this.syncTestManagement();
    return ret;
  }

  private lastRecord?: RunRecord;

  private async syncTestManagement(): Promise<void> {
    const options = this.options.testManagement;
    if (!options || !this.lastRecord || (!options.testrail && !options.xray)) return;
    try {
      const { results, errors } = await syncTestManagement(this.lastRecord, options);
      for (const r of results) {
        if (r.sent > 0) console.log(`[testfly] ${r.target}: sent ${r.sent} result(s)${r.reference ? ` → ${r.reference}` : ''}`);
      }
      for (const e of errors) this.warn(`test management sync failed: ${e}`);
    } catch (e) {
      this.warn(`test management sync skipped: ${(e as Error).message}`);
    }
  }

  private notification?: NotificationPayload;

  private async notify(): Promise<void> {
    const options = this.options.notifications;
    if (!options || !this.notification) return;
    try {
      const { failed } = await notifyRun(options, this.notification);
      if (failed.length) this.warn(`notification failed for: ${failed.join(', ')}`);
    } catch (e) {
      this.warn(`notifications skipped: ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- internals

  private warn(message: string): void {
    this.warnings++;
    console.warn(`[testfly] ${message}`);
  }

  private get outputDir(): string {
    return resolve(process.cwd(), this.options.outputDir);
  }

  private titlePathOf(test: TestCase): { project: string; file: string; titlePath: string[] } {
    // test.titlePath() = ['', projectName, file, ...describes, title]
    const tp = test.titlePath();
    const project = test.parent.project()?.name ?? tp[1] ?? '';
    const root = this.config?.rootDir ?? process.cwd();
    const file = toPosix(relative(root, test.location.file));
    return { project, file, titlePath: tp.slice(3) };
  }

  private testId(test: TestCase): string {
    const { project, file, titlePath } = this.titlePathOf(test);
    return `${project}::${file}::${titlePath.join(' › ')}`;
  }

  private parseAttachments(
    results: TestResult[],
  ): { heals: HealEvent[]; ai: AiEvent[]; analysis?: string; perAttempt: Array<{ steps: StepEvent[]; api: ApiEvent[]; console: ConsoleEvent[] }> } {
    const heals: HealEvent[] = [];
    const ai: AiEvent[] = [];
    let analysis: string | undefined;
    const perAttempt: Array<{ steps: StepEvent[]; api: ApiEvent[]; console: ConsoleEvent[] }> = [];
    for (const r of results) {
      const steps: StepEvent[] = [];
      const api: ApiEvent[] = [];
      const consoleEvents: ConsoleEvent[] = [];
      for (const att of r?.attachments ?? []) {
        if (!TESTFLY_TYPES.has(att.contentType)) continue;
        let payload: unknown;
        try {
          const raw = att.body ?? (att.path ? readFileSync(att.path) : undefined);
          if (!raw) continue;
          payload = JSON.parse(raw.toString('utf8'));
        } catch {
          this.warn(`ignoring unreadable "${att.name}" attachment`);
          continue;
        }
        for (const item of Array.isArray(payload) ? payload : [payload]) {
          const parse = <T>(schema: { safeParse(v: unknown): { success: boolean; data?: T } }): T | undefined => {
            const res = schema.safeParse(item);
            if (!res.success) this.warn(`ignoring invalid "${att.name}" attachment`);
            return res.success ? res.data : undefined;
          };
          switch (att.contentType) {
            case CONTENT_TYPES.heal: {
              const v = parse<HealEvent>(HealEventSchema);
              if (v) heals.push(v);
              break;
            }
            case CONTENT_TYPES.step: {
              const v = parse<StepEvent>(StepEventSchema);
              if (v) steps.push(v);
              break;
            }
            case CONTENT_TYPES.api: {
              const v = parse<ApiEvent>(ApiEventSchema);
              if (v) api.push(v);
              break;
            }
            case CONTENT_TYPES.ai: {
              const v = parse<AiEvent>(AiEventSchema);
              if (v) ai.push(v);
              break;
            }
            case CONTENT_TYPES.console: {
              const v = parse<ConsoleEvent>(ConsoleEventSchema);
              if (v) consoleEvents.push(v);
              break;
            }
            case CONTENT_TYPES.meta: {
              const v = parse<{ analysis?: string }>(MetaEventSchema);
              if (v?.analysis) analysis = v.analysis;
              break;
            }
          }
        }
      }
      perAttempt.push({ steps, api, console: consoleEvents });
    }
    return { heals, ai, analysis, perAttempt };
  }

  private collectArtifacts(results: TestResult[]): TestRecord['artifacts'] {
    const out: TestRecord['artifacts'] = [];
    const base = this.outputDir;
    results.forEach((r, attempt) => {
      for (const att of r?.attachments ?? []) {
        if (!att.path || TESTFLY_TYPES.has(att.contentType)) continue;
        const isMedia = att.contentType.startsWith('image/') || att.contentType.startsWith('video/') || ARTIFACT_NAMES.has(att.name);
        if (!isMedia) continue;
        const rel = relative(base, att.path);
        const path = rel && !rel.startsWith('..') && !isAbsolute(rel) ? toPosix(rel) : toPosix(att.path);
        out.push({ name: attempt > 0 ? `${att.name} (retry ${attempt})` : att.name, path, contentType: att.contentType });
      }
    });
    return out;
  }

  private matchQuarantineFile(test: TestCase, project: string, titlePath: string[]): { reason?: string } | null {
    if (this.quarantine.entries.length === 0) return null;
    return matchQuarantine(this.quarantine, {
      file: toPosix(relative(this.quarantineBaseDir, test.location.file)),
      titlePath,
      tags: [...(test.tags ?? [])],
      project,
    });
  }

  private buildRecord(acc: Accumulator): TestRecord {
    const { test } = acc;
    const results = acc.results.filter(Boolean);
    const last = results[results.length - 1];
    const { project, file, titlePath } = this.titlePathOf(test);
    const outcome = test.outcome();
    const annotation = [...(last?.annotations ?? []), ...test.annotations].find((a) => a.type === 'quarantine');
    const listed = annotation ? null : this.matchQuarantineFile(test, project, titlePath);
    const quarantined = annotation !== undefined || listed !== null;
    const quarantineReason = annotation ? annotation.description : listed?.reason;

    let status: TestRecord['status'];
    let flaky = false;
    if (outcome === 'skipped' || last?.status === 'skipped') status = 'skipped';
    else if (outcome === 'expected') status = 'passed';
    else if (outcome === 'flaky') {
      status = 'passed';
      flaky = true;
    } else status = last?.status === 'timedOut' ? 'timedOut' : last?.status === 'interrupted' ? 'interrupted' : 'failed';
    if (status === 'passed' && !flaky && last && last.retry > 0 && last.status === 'passed') flaky = true;

    const parsed = this.parseAttachments(results);
    const heals = parsed.heals;
    const lastAttempt = parsed.perAttempt[parsed.perAttempt.length - 1] ?? { steps: [], api: [], console: [] };

    // For flaky tests the interesting error is the last failed attempt.
    const failedResult = [...results].reverse().find((r) => r.status === 'failed' || r.status === 'timedOut');
    const err = status === 'failed' || status === 'timedOut' || status === 'interrupted' ? (last?.error ?? failedResult?.error) : flaky ? failedResult?.error : undefined;
    const error = err
      ? {
          message: stripAnsi(err.message ?? String(err.value ?? 'Unknown error')),
          stack: err.stack ? stripAnsi(err.stack) : undefined,
          snippet: err.snippet ? stripAnsi(err.snippet) : undefined,
        }
      : undefined;
    const triage = error
      ? triageFailure(error, { retries: last?.retry ?? 0, passedOnRetry: flaky, heals: heals.length })
      : undefined;

    return {
      id: this.testId(test),
      title: test.title,
      titlePath,
      file,
      line: test.location.line,
      project,
      tags: [...(test.tags ?? [])],
      status,
      flaky,
      quarantined,
      quarantineReason,
      retries: Math.max(0, results.length - 1),
      durationMs: Math.round(results.reduce((sum, r) => sum + r.duration, 0)),
      error,
      triage,
      heals,
      steps: lastAttempt.steps,
      api: lastAttempt.api,
      ai: parsed.ai,
      console: lastAttempt.console,
      artifacts: this.collectArtifacts(results),
      analysis: parsed.analysis,
    };
  }

  private finish(result: FullResult): { status?: FullResult['status'] } | undefined {
    const tests = [...this.tests.values()].map((a) => this.buildRecord(a));
    // AI failure analysis written by @testfly/ai/reporter earlier in this run (reporters finish in order).
    applyAnalyses(tests, readAnalysisFile(join(this.outputDir, 'report'), this.startedAt));
    const totals = computeTotals(tests);
    const shard = this.config?.shard ?? undefined;
    // Playwright fails the run for quarantined failures too; when they are the only failures
    // (no global errors, nothing interrupted/timed out) the run is treated as passed.
    const onlyQuarantinedFailed =
      result.status === 'failed' && totals.failed === 0 && this.globalErrors === 0 && tests.some((t) => t.quarantined && t.status !== 'passed' && t.status !== 'skipped');
    const status: RunRecord['status'] = onlyQuarantinedFailed ? 'passed' : result.status === 'passed' && totals.failed > 0 ? 'failed' : result.status;
    const record = RunRecordSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      runId: `${new Date(this.startedAt).toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: this.startedAt,
      durationMs: Math.round(result.duration ?? Date.now() - this.startedAt),
      status,
      env: this.options.env ?? process.env.TESTFLY_ENV,
      playwrightVersion: this.config?.version,
      shard: shard ? { current: shard.current, total: shard.total } : undefined,
      ci: detectCi(),
      totals,
      tests,
    });

    const historyDir = join(this.outputDir, 'history');
    const reportDir = join(this.outputDir, 'report');
    writeRun(historyDir, record);
    pruneHistory(historyDir, this.options.historySize);
    const history = readHistory(historyDir, this.options.historySize);
    const flakiness = computeFlakiness(history);
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'flakiness.json'), JSON.stringify(flakiness, null, 2) + '\n');
    writeHealLog(reportDir, record);

    let dashboardFile: string | undefined;
    if (this.options.dashboard) {
      try {
        dashboardFile = join(reportDir, 'index.html');
        generateDashboard(history, dashboardFile);
      } catch (e) {
        dashboardFile = undefined;
        this.warn(`dashboard generation failed: ${(e as Error).message}`);
      }
    }

    const gate = evaluateGate(record, flakiness, this.options.qualityGate);
    writeFileSync(
      join(reportDir, 'summary.json'),
      JSON.stringify(
        {
          runId: record.runId,
          status: gate.passed ? record.status : 'failed',
          totals: record.totals,
          passRate: Math.round(passRate(record.totals) * 10) / 10,
          durationMs: record.durationMs,
          gate: { passed: gate.passed, violations: gate.violations },
          flakiness: {
            high: flakiness.filter((f) => f.risk === 'HIGH').length,
            watch: flakiness.filter((f) => f.risk === 'WATCH').length,
            stable: flakiness.filter((f) => f.risk === 'STABLE').length,
          },
          warnings: this.warnings,
          dashboard: dashboardFile,
        },
        null,
        2,
      ) + '\n',
    );

    this.lastRecord = record;
    const failedRun = !gate.passed || record.status !== 'passed';
    this.notification = {
      title: this.options.notifications?.title ?? (record.env ? `Playwright run (${record.env})` : 'Playwright run'),
      status: failedRun ? 'failed' : 'passed',
      totalTests: record.totals.total,
      passedTests: record.totals.passed,
      failedTests: record.totals.failed,
      duration: `${Math.round(record.durationMs / 100) / 10}s`,
      reportUrl: this.options.notifications?.reportUrl ?? record.ci?.buildUrl,
    };

    if (this.options.printSummary) {
      printSummary({ record, gate, gateConfigured: this.options.qualityGate !== undefined, flakiness, dashboardFile, warnings: this.warnings });
    }
    if (!gate.passed) return { status: 'failed' };
    return onlyQuarantinedFailed ? { status: 'passed' } : undefined;
  }
}

export { TestFlyReporter };
