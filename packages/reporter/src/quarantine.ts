import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

/** One normalized quarantine rule. @public */
export interface QuarantineEntry {
  kind: 'file' | 'test' | 'tag';
  /** File path (kind file/test) or tag including leading `@` (kind tag). */
  file?: string;
  tag?: string;
  /** Title path segments after the file (kind test). */
  titlePath?: string[];
  reason?: string;
  project?: string;
  /** Expiry as epoch ms (end of the given UTC day). */
  untilMs?: number;
}

/** Parsed `testfly-quarantine.yml`. @public */
export interface QuarantineList {
  entries: QuarantineEntry[];
  /** Entries dropped because `until` is in the past. */
  expired: QuarantineEntry[];
}

const SEP = '›';

const ObjectEntrySchema = z.object({
  test: z.string().min(1),
  reason: z.string().optional(),
  project: z.string().optional(),
  until: z.union([z.string(), z.date()]).optional(),
});
const FileSchema = z.object({
  quarantine: z.array(z.union([z.string().min(1), ObjectEntrySchema])).default([]),
});

function invalid(message: string, hint: string): Error {
  return new Error(`[TF_QUARANTINE_INVALID] ${message}\n  → ${hint}`);
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

function parseSpec(spec: string, extra: Pick<QuarantineEntry, 'reason' | 'project' | 'untilMs'>): QuarantineEntry {
  const trimmed = spec.trim();
  if (trimmed.startsWith('@')) return { kind: 'tag', tag: trimmed, ...extra };
  if (trimmed.includes(SEP)) {
    const [file, ...rest] = trimmed.split(SEP).map((s) => s.trim());
    return { kind: 'test', file: normPath(file ?? ''), titlePath: rest.filter(Boolean), ...extra };
  }
  return { kind: 'file', file: normPath(trimmed), ...extra };
}

function parseUntil(value: string | Date, spec: string): number {
  const d = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value);
  const ms = value instanceof Date ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999) : d.getTime();
  if (Number.isNaN(ms)) throw invalid(`Invalid "until" date for "${spec}": ${String(value)}`, 'Use YYYY-MM-DD, e.g. until: 2026-12-31');
  return ms;
}

/**
 * Parses quarantine YAML text. Throws `[TF_QUARANTINE_INVALID]` on malformed content.
 * Expired entries are moved to `expired` and a warning is printed.
 *
 * @public
 */
export function parseQuarantine(text: string, source = 'testfly-quarantine.yml', now: number = Date.now()): QuarantineList {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (e) {
    throw invalid(`Cannot parse ${source}: ${(e as Error).message}`, 'Fix the YAML syntax.');
  }
  if (doc === null || doc === undefined) return { entries: [], expired: [] };
  const result = FileSchema.safeParse(doc);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw invalid(`${source} is invalid: ${detail}`, 'Expected a top-level "quarantine:" list of strings or { test, reason?, project?, until? } objects.');
  }
  const entries: QuarantineEntry[] = [];
  const expired: QuarantineEntry[] = [];
  for (const raw of result.data.quarantine) {
    let entry: QuarantineEntry;
    if (typeof raw === 'string') {
      entry = parseSpec(raw, {});
    } else {
      entry = parseSpec(raw.test, {
        reason: raw.reason,
        project: raw.project,
        untilMs: raw.until === undefined ? undefined : parseUntil(raw.until, raw.test),
      });
    }
    if (entry.untilMs !== undefined && entry.untilMs < now) expired.push(entry);
    else entries.push(entry);
  }
  if (expired.length > 0) {
    const names = expired.map((e) => e.tag ?? [e.file, ...(e.titlePath ?? [])].join(` ${SEP} `)).join(', ');
    console.warn(`[testfly] ${expired.length} expired quarantine entr${expired.length === 1 ? 'y' : 'ies'} in ${source} ignored: ${names}`);
  }
  return { entries, expired };
}

/**
 * Loads the quarantine file. A missing file yields an empty list; an invalid file throws an
 * Error starting with `[TF_QUARANTINE_INVALID]`.
 *
 * @public
 */
export function loadQuarantine(file: string): QuarantineList {
  if (!existsSync(file)) return { entries: [], expired: [] };
  return parseQuarantine(readFileSync(file, 'utf8'), file);
}

function fileMatches(entryFile: string, testFile: string): boolean {
  const a = normPath(entryFile).toLowerCase();
  const b = normPath(testFile).toLowerCase();
  return a === b || b.endsWith('/' + a) || a.endsWith('/' + b);
}

/**
 * Checks whether a test is quarantined. Returns `{ reason? }` for the first matching entry or
 * `null`. Title matching is case-insensitive and also matches a describe-level prefix.
 *
 * @public
 */
export function matchQuarantine(
  list: QuarantineList,
  test: { file: string; titlePath: string[]; tags: string[]; project?: string },
): { reason?: string } | null {
  const tags = new Set(test.tags.map((t) => (t.startsWith('@') ? t : `@${t}`).toLowerCase()));
  const titles = test.titlePath.map((s) => s.trim().toLowerCase());
  for (const e of list.entries) {
    if (e.project && test.project && e.project !== test.project) continue;
    let hit = false;
    if (e.kind === 'tag') hit = tags.has((e.tag ?? '').toLowerCase());
    else if (e.kind === 'file') hit = fileMatches(e.file ?? '', test.file);
    else if (fileMatches(e.file ?? '', test.file)) {
      const want = (e.titlePath ?? []).map((s) => s.toLowerCase());
      hit = want.length > 0 && want.length <= titles.length && want.every((w, i) => titles[i] === w);
    }
    if (hit) return e.reason === undefined ? {} : { reason: e.reason };
  }
  return null;
}
