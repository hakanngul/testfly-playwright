import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HealEvent, RunRecord } from './schema';

/** One healed locator of a run, with the test it happened in. @public */
export type HealLogEntry = HealEvent & { testId: string; test: string; file: string; project: string };

/** File name of the per-run heal log inside `<outputDir>/report`. @public */
export const HEAL_LOG_FILE = 'heal-log.json';

/**
 * Writes every heal of the run (rules, fuzzy and AI strategies alike) to `<reportDir>/heal-log.json`,
 * so locators that need a permanent fix can be reviewed after a run. Always written (an empty array
 * means nothing healed).
 *
 * @internal
 */
export function writeHealLog(reportDir: string, record: RunRecord): HealLogEntry[] {
  const entries: HealLogEntry[] = record.tests.flatMap((t) =>
    t.heals.map((h) => ({ ...h, testId: t.id, test: t.titlePath.join(' › ') || t.title, file: t.file, project: t.project })),
  );
  writeFileSync(join(reportDir, HEAL_LOG_FILE), JSON.stringify(entries, null, 2) + '\n');
  return entries;
}
