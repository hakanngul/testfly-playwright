import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { generateDashboard } from './dashboard';
import { readHistory, writeRun } from './history';
import type { TestRecord } from './schema';

/** File written by `@testfly/ai/reporter` inside `<outputDir>/report`. @public */
export const AI_ANALYSIS_FILE = 'ai-analysis.json';

/**
 * Reads `<reportDir>/ai-analysis.json` (`{ [testId]: markdown }`). With `since`, a file older than that
 * timestamp (left over from an earlier run) is ignored. Missing or invalid files yield `{}`.
 *
 * @public
 */
export function readAnalysisFile(reportDir: string, since?: number): Record<string, string> {
  const file = join(reportDir, AI_ANALYSIS_FILE);
  try {
    // 1s slack: file system timestamps can be coarser than Date.now().
    if (since !== undefined && statSync(file).mtimeMs < since - 1_000) return {};
    const data = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch {
    return {};
  }
}

/** Copies analyses onto tests that have none yet. Returns the number of tests updated. @internal */
export function applyAnalyses(tests: TestRecord[], analyses: Record<string, string>): number {
  let updated = 0;
  for (const t of tests) {
    const text = analyses[t.id];
    if (text && !t.analysis) {
      t.analysis = text;
      updated++;
    }
  }
  return updated;
}

/**
 * Embeds AI failure analyses into the most recent run record of `<outputDir>/history` and regenerates
 * `<outputDir>/report/index.html` when it exists. Used by `@testfly/ai/reporter` when it finishes after
 * `@testfly/reporter`; when it finishes first, `@testfly/reporter` reads `ai-analysis.json` itself.
 *
 * @returns the number of tests that received an analysis.
 * @public
 */
export function embedAnalysis(outputDir: string, analyses: Record<string, string>): number {
  const historyDir = join(outputDir, 'history');
  const runs = readHistory(historyDir);
  const latest = runs[runs.length - 1];
  if (!latest) return 0;
  const updated = applyAnalyses(latest.tests, analyses);
  if (updated === 0) return 0;
  writeRun(historyDir, latest);
  const dashboard = join(outputDir, 'report', 'index.html');
  if (existsSync(dashboard)) generateDashboard(readHistory(historyDir), dashboard);
  return updated;
}
