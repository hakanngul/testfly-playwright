import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import type { AiOptions } from '@testfly/playwright';
import { embedAnalysis } from '@testfly/reporter';
import { CONTENT_TYPES } from '@testfly/reporter/schema';
import type { StepEvent } from '@testfly/reporter/schema';
import { redact } from './context/redact';
import { resolveAiOptions } from './options';
import { analysisSystemPrompt, analysisUserPrompt } from './prompts';
import { AiRuntime } from './runtime';

/** Options of the `@testfly/ai/reporter` reporter: all AI options plus a few of its own. @public */
export interface AiReporterOptions extends Partial<AiOptions> {
  /** Max failed tests analysed per run. Default 10. */
  maxAnalyses?: number;
  /** Parallel provider calls. Default 3. */
  concurrency?: number;
  /** Output directory (analysis goes to `<outputDir>/report/ai-analysis.json`). Default `.testfly`. */
  outputDir?: string;
}

interface Pending {
  id: string;
  title: string;
  error: string;
  snippet?: string;
  steps: string[];
  url?: string;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(ANSI, '');

function parseJsonAttachment<T>(body: Buffer | undefined): T | undefined {
  if (!body) return undefined;
  try {
    return JSON.parse(body.toString('utf8')) as T;
  } catch {
    return undefined;
  }
}

/**
 * Opt-in AI failure analysis reporter:
 * `reporter: [['@testfly/ai/reporter', { provider: 'anthropic' }]]`.
 *
 * Collects failed tests (final attempt only), asks the model for a root-cause analysis and writes
 * `<outputDir>/report/ai-analysis.json` (`{ [testId]: markdown }`). Never fails the run.
 * The analyses are embedded in the `@testfly/reporter` run record and dashboard, whichever reporter finishes first.
 *
 * @public
 */
export default class AiFailureAnalysisReporter implements Reporter {
  private readonly options: AiReporterOptions;
  private rootDir = process.cwd();
  private readonly pending: Pending[] = [];

  constructor(options: AiReporterOptions = {}) {
    this.options = options;
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    this.rootDir = config.rootDir;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;
    if (result.retry < test.retries) return; // only the final attempt
    const err = result.errors[0] ?? result.error;
    if (!err) return;

    const steps = result.attachments
      .filter((a) => a.contentType === CONTENT_TYPES.step)
      .map((a) => parseJsonAttachment<StepEvent>(a.body))
      .filter((s): s is StepEvent => !!s)
      .slice(-15)
      .map((s) => `[${s.level}] ${s.title}`);
    let url: string | undefined;
    for (const a of result.attachments) {
      if (a.contentType !== CONTENT_TYPES.meta) continue;
      const meta = parseJsonAttachment<{ url?: string }>(a.body);
      if (meta?.url) url = meta.url;
    }

    const project = test.parent.project()?.name ?? '';
    const file = relative(this.rootDir, test.location.file).split('\\').join('/');
    this.pending.push({
      id: `${project}::${file}::${test.titlePath().slice(3).join(' › ')}`,
      title: test.titlePath().slice(1).join(' › '),
      error: strip(err.message ?? 'Unknown error').slice(0, 4_000),
      snippet: err.snippet ? strip(err.snippet).slice(0, 2_000) : undefined,
      steps,
      url,
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (!this.pending.length) return;
    try {
      await this.analyse();
    } catch (err) {
      console.log(`[testfly-ai] failure analysis skipped: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    }
  }

  private async analyse(): Promise<void> {
    const options = resolveAiOptions(this.options);
    if (options.mode !== 'live') {
      console.log(`[testfly-ai] failure analysis skipped (ai.mode = "${options.mode}").`);
      return;
    }
    const runtime = new AiRuntime(options, this.rootDir);
    const max = this.options.maxAnalyses ?? 10;
    const concurrency = Math.max(1, this.options.concurrency ?? 3);
    const queue = this.pending.slice(0, max);
    const out: Record<string, string> = {};
    let next = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const item = queue[next++];
        if (!item) return;
        try {
          const res = await runtime.complete({
            system: analysisSystemPrompt(),
            messages: [{ role: 'user', content: analysisUserPrompt(item) }],
            maxTokens: Math.max(options.maxTokens, 1_500),
            temperature: 0.2,
          });
          out[item.id] = redact(res.text, options.redact);
        } catch (err) {
          console.log(`[testfly-ai] analysis failed for "${item.title}": ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));

    if (!Object.keys(out).length) return;
    const dir = resolve(this.rootDir, this.options.outputDir ?? '.testfly', 'report');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'ai-analysis.json');
    writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`[testfly-ai] analysed ${Object.keys(out).length}/${this.pending.length} failed test(s) → ${relative(this.rootDir, file)}`);
    // If @testfly/reporter already finished (it runs after this reporter only when listed later),
    // put the analyses into its run record and dashboard too.
    try {
      embedAnalysis(resolve(this.rootDir, this.options.outputDir ?? '.testfly'), out);
    } catch (err) {
      console.log(`[testfly-ai] could not embed the analysis in the dashboard: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    }
  }
}
