import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadQuarantine, matchQuarantine, parseQuarantine } from '../src/quarantine';
import { useTmpDirs } from './helpers/tmp';

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0); // 2026-10-14T12:00Z
const tmp = useTmpDirs();

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

const t = (over: Record<string, unknown> = {}) => ({ file: 'tests/login.spec.ts', titlePath: ['Login', 'logs in'], tags: [] as string[], ...over });

describe('parseQuarantine formats', () => {
  it('parses plain file entries', () => {
    const l = parseQuarantine('quarantine:\n  - tests/login.spec.ts\n', 'x.yml', NOW);
    expect(l.entries).toEqual([{ kind: 'file', file: 'tests/login.spec.ts' }]);
  });

  it('parses "file › title path" entries (multiple segments)', () => {
    const l = parseQuarantine('quarantine:\n  - "tests/login.spec.ts › Login › logs in"\n', 'x.yml', NOW);
    expect(l.entries[0]).toEqual({ kind: 'test', file: 'tests/login.spec.ts', titlePath: ['Login', 'logs in'] });
  });

  it('parses @tag entries', () => {
    const l = parseQuarantine('quarantine:\n  - "@flaky"\n', 'x.yml', NOW);
    expect(l.entries[0]).toEqual({ kind: 'tag', tag: '@flaky' });
  });

  it('parses structured entries with reason, project and until', () => {
    const l = parseQuarantine(
      'quarantine:\n  - test: "a.spec.ts › slow"\n    reason: JIRA-1\n    project: firefox\n    until: 2026-12-31\n',
      'x.yml',
      NOW,
    );
    expect(l.entries).toHaveLength(1);
    expect(l.entries[0]).toMatchObject({ kind: 'test', file: 'a.spec.ts', titlePath: ['slow'], reason: 'JIRA-1', project: 'firefox', untilMs: Date.UTC(2026, 11, 31, 23, 59, 59, 999) });
  });

  it('normalizes ./ prefixes and backslashes in paths', () => {
    const l = parseQuarantine('quarantine:\n  - ./tests\\a.spec.ts\n', 'x.yml', NOW);
    expect(l.entries[0]!.file).toBe('tests/a.spec.ts');
  });

  it('empty document and missing "quarantine" key give an empty list', () => {
    expect(parseQuarantine('', 'x', NOW)).toEqual({ entries: [], expired: [] });
    expect(parseQuarantine('# just a comment\n', 'x', NOW)).toEqual({ entries: [], expired: [] });
    expect(parseQuarantine('quarantine: []\n', 'x', NOW)).toEqual({ entries: [], expired: [] });
    expect(parseQuarantine('{}\n', 'x', NOW).entries).toEqual([]);
  });
});

describe('expiry', () => {
  it('drops expired entries into `expired` and warns once', () => {
    const l = parseQuarantine('quarantine:\n  - test: old.spec.ts\n    until: 2026-01-01\n  - keep.spec.ts\n', 'q.yml', NOW);
    expect(l.entries.map((e) => e.file)).toEqual(['keep.spec.ts']);
    expect(l.expired.map((e) => e.file)).toEqual(['old.spec.ts']);
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]![0]);
    expect(msg).toContain('1 expired quarantine entry');
    expect(msg).toContain('old.spec.ts');
    expect(msg).toContain('q.yml');
  });

  it('pluralizes the warning for several expired entries', () => {
    parseQuarantine('quarantine:\n  - {test: a.ts, until: 2020-01-01}\n  - {test: "@x", until: 2020-01-02}\n', 'q.yml', NOW);
    expect(String(warn.mock.calls[0]![0])).toContain('2 expired quarantine entries');
  });

  it('an entry is still valid during the whole until day (end of UTC day)', () => {
    const l = parseQuarantine('quarantine:\n  - {test: a.ts, until: 2026-10-14}\n', 'q', NOW);
    expect(l.entries).toHaveLength(1);
    expect(l.expired).toHaveLength(0);
    const next = parseQuarantine('quarantine:\n  - {test: a.ts, until: 2026-10-14}\n', 'q', Date.UTC(2026, 9, 15, 0, 0, 0, 0));
    expect(next.expired).toHaveLength(1);
  });

  it('does not warn when nothing expired', () => {
    parseQuarantine('quarantine:\n  - a.ts\n', 'q', NOW);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects an unparseable until with TF_QUARANTINE_INVALID', () => {
    expect(() => parseQuarantine('quarantine:\n  - {test: a.ts, until: not-a-date}\n', 'q', NOW)).toThrow(/^\[TF_QUARANTINE_INVALID\]/);
  });
});

describe('invalid content', () => {
  it('invalid YAML syntax', () => {
    expect(() => parseQuarantine('quarantine: [unclosed\n  - : :\n', 'q.yml', NOW)).toThrowError(/^\[TF_QUARANTINE_INVALID\] Cannot parse q\.yml/);
  });

  it.each([
    ['quarantine not a list', 'quarantine: 5\n'],
    ['top-level list', '- a.ts\n'],
    ['top-level scalar', 'hello\n'],
    ['object entry without test', 'quarantine:\n  - reason: x\n'],
    ['empty string entry', 'quarantine:\n  - ""\n'],
    ['number entry', 'quarantine:\n  - 42\n'],
  ])('shape error: %s', (_n, yml) => {
    let err: Error | undefined;
    try { parseQuarantine(yml, 'q.yml', NOW); } catch (e) { err = e as Error; }
    expect(err).toBeInstanceOf(Error);
    expect(err!.message.startsWith('[TF_QUARANTINE_INVALID]')).toBe(true);
    expect(err!.message).toContain('→');
  });
});

describe('loadQuarantine', () => {
  it('missing file yields an empty list', () => {
    expect(loadQuarantine(join(tmp(), 'nope.yml'))).toEqual({ entries: [], expired: [] });
  });

  it('reads and parses a file from disk', () => {
    const f = join(tmp(), 'q.yml');
    writeFileSync(f, 'quarantine:\n  - "@slow"\n  - tests/a.spec.ts\n');
    expect(loadQuarantine(f).entries).toHaveLength(2);
  });

  it('invalid file throws with the file name in the message', () => {
    const f = join(tmp(), 'bad.yml');
    writeFileSync(f, 'quarantine: nope: nope\n');
    expect(() => loadQuarantine(f)).toThrowError(/^\[TF_QUARANTINE_INVALID\].*bad\.yml/);
  });

  it('a directory in place of the file is not silently treated as empty', () => {
    const d = join(tmp(), 'q.yml');
    mkdirSync(d);
    expect(() => loadQuarantine(d)).toThrow();
  });
});

describe('matchQuarantine', () => {
  const list = (yml: string) => parseQuarantine(yml, 'q', NOW);

  it('file entry matches every test in the file', () => {
    const l = list('quarantine:\n  - tests/login.spec.ts\n');
    expect(matchQuarantine(l, t())).toEqual({});
    expect(matchQuarantine(l, t({ titlePath: ['other'] }))).toEqual({});
    expect(matchQuarantine(l, t({ file: 'tests/other.spec.ts' }))).toBeNull();
  });

  it('is case-insensitive for files, titles and tags', () => {
    expect(matchQuarantine(list('quarantine:\n  - TESTS/Login.SPEC.ts\n'), t())).toEqual({});
    expect(matchQuarantine(list('quarantine:\n  - "tests/login.spec.ts › LOGIN › Logs IN"\n'), t())).toEqual({});
    expect(matchQuarantine(list('quarantine:\n  - "@FLAKY"\n'), t({ tags: ['@flaky'] }))).toEqual({});
  });

  it('tag entries match with or without leading @ on the test tags', () => {
    const l = list('quarantine:\n  - "@flaky"\n');
    expect(matchQuarantine(l, t({ tags: ['flaky'] }))).toEqual({});
    expect(matchQuarantine(l, t({ tags: ['@flaky'] }))).toEqual({});
    expect(matchQuarantine(l, t({ tags: ['@stable'] }))).toBeNull();
    expect(matchQuarantine(l, t())).toBeNull();
  });

  it('matches relative entry against an absolute test path (and vice versa)', () => {
    const rel = list('quarantine:\n  - tests/login.spec.ts\n');
    expect(matchQuarantine(rel, t({ file: '/home/ci/work/proj/tests/login.spec.ts' }))).toEqual({});
    const abs = list('quarantine:\n  - /home/ci/work/proj/tests/login.spec.ts\n');
    expect(matchQuarantine(abs, t({ file: 'tests/login.spec.ts' }))).toEqual({});
  });

  it('matches Windows separators in the test path', () => {
    const rel = list('quarantine:\n  - tests/login.spec.ts\n');
    expect(matchQuarantine(rel, t({ file: 'C:\\work\\proj\\tests\\login.spec.ts' }))).toEqual({});
  });

  it('does not match a file that merely shares a suffix without a path boundary', () => {
    const l = list('quarantine:\n  - login.spec.ts\n');
    expect(matchQuarantine(l, t({ file: 'tests/mylogin.spec.ts' }))).toBeNull();
    expect(matchQuarantine(l, t({ file: 'tests/login.spec.ts' }))).toEqual({});
  });

  it('exact test path matches; different title does not', () => {
    const l = list('quarantine:\n  - "tests/login.spec.ts › Login › logs in"\n');
    expect(matchQuarantine(l, t())).toEqual({});
    expect(matchQuarantine(l, t({ titlePath: ['Login', 'logs out'] }))).toBeNull();
    expect(matchQuarantine(l, t({ file: 'tests/x.spec.ts' }))).toBeNull();
  });

  it('describe-level prefix matches all nested tests', () => {
    const l = list('quarantine:\n  - "tests/login.spec.ts › Login"\n');
    expect(matchQuarantine(l, t())).toEqual({});
    expect(matchQuarantine(l, t({ titlePath: ['Login', 'Nested', 'deep'] }))).toEqual({});
    expect(matchQuarantine(l, t({ titlePath: ['Logout', 'x'] }))).toBeNull();
  });

  it('an entry deeper than the test title path never matches', () => {
    const l = list('quarantine:\n  - "tests/login.spec.ts › Login › logs in › extra"\n');
    expect(matchQuarantine(l, t())).toBeNull();
  });

  it('returns the reason of the structured entry', () => {
    const l = list('quarantine:\n  - {test: "@slow", reason: "JIRA-7"}\n');
    expect(matchQuarantine(l, t({ tags: ['@slow'] }))).toEqual({ reason: 'JIRA-7' });
  });

  it('first matching entry wins', () => {
    const l = list('quarantine:\n  - {test: tests/login.spec.ts, reason: first}\n  - {test: "@x", reason: second}\n');
    expect(matchQuarantine(l, t({ tags: ['@x'] }))).toEqual({ reason: 'first' });
  });

  it('project filter: entry only applies to its project', () => {
    const l = list('quarantine:\n  - {test: tests/login.spec.ts, project: firefox}\n');
    expect(matchQuarantine(l, t({ project: 'firefox' }))).toEqual({});
    expect(matchQuarantine(l, t({ project: 'chromium' }))).toBeNull();
  });

  it('project filter is not applied when the test has no project info', () => {
    const l = list('quarantine:\n  - {test: tests/login.spec.ts, project: firefox}\n');
    expect(matchQuarantine(l, t())).toEqual({});
  });

  it('expired entries do not match', () => {
    const l = list('quarantine:\n  - {test: tests/login.spec.ts, until: 2026-01-01}\n');
    expect(matchQuarantine(l, t())).toBeNull();
  });

  it('empty list matches nothing', () => {
    expect(matchQuarantine({ entries: [], expired: [] }, t())).toBeNull();
  });
});
