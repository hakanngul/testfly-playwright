import { describe, expect, it } from 'vitest';
import {
  AiEventSchema,
  ApiEventSchema,
  CONTENT_TYPES,
  FlakinessEntrySchema,
  HealEventSchema,
  RunRecordSchema,
  SCHEMA_VERSION,
  StepEventSchema,
  TestRecordSchema,
  toAttachment,
} from '../src/schema';
import { heal, makeRun, makeTest } from './helpers/records';

describe('RunRecordSchema', () => {
  it('accepts a valid run and applies defaults for optional arrays', () => {
    const minimalTest = {
      id: 'p::f::t', title: 't', titlePath: ['t'], file: 'f', project: 'p',
      status: 'passed', flaky: false, retries: 0, durationMs: 1,
    };
    const run = RunRecordSchema.parse({ ...makeRun([]), tests: [minimalTest], totals: { total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, quarantined: 0, healed: 0 } });
    expect(run.tests[0]).toMatchObject({ tags: [], heals: [], steps: [], api: [], ai: [], artifacts: [], quarantined: false });
  });

  it('exposes schema version 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(makeRun([makeTest()]).schemaVersion).toBe(1);
  });

  it.each([
    ['wrong schemaVersion', (r: any) => { r.schemaVersion = 2; }],
    ['missing runId', (r: any) => { delete r.runId; }],
    ['bad status', (r: any) => { r.status = 'weird'; }],
    ['uppercase timedout mismatch', (r: any) => { r.status = 'timedOut'; }],
    ['non-integer totals', (r: any) => { r.totals.total = 1.5; }],
    ['missing totals', (r: any) => { delete r.totals; }],
    ['test with bad status', (r: any) => { r.tests[0].status = 'ok'; }],
    ['test with bad triage', (r: any) => { r.tests[0].triage = 'NOPE'; }],
    ['non-array tests', (r: any) => { r.tests = {}; }],
  ])('rejects %s', (_n, mutate) => {
    const run: any = JSON.parse(JSON.stringify(makeRun([makeTest()])));
    mutate(run);
    expect(RunRecordSchema.safeParse(run).success).toBe(false);
  });

  it('accepts shard and ci metadata', () => {
    const r = RunRecordSchema.parse({ ...makeRun([]), shard: { current: 1, total: 3 }, ci: { provider: 'github-actions', branch: 'main' } });
    expect(r.shard).toEqual({ current: 1, total: 3 });
    expect(r.ci?.provider).toBe('github-actions');
  });
});

describe('event schemas', () => {
  it('HealEvent bounds confidence to 0..1', () => {
    expect(HealEventSchema.safeParse(heal()).success).toBe(true);
    expect(HealEventSchema.safeParse(heal({ confidence: 1.2 })).success).toBe(false);
    expect(HealEventSchema.safeParse(heal({ confidence: -0.1 })).success).toBe(false);
    expect(HealEventSchema.safeParse({ key: 'k' }).success).toBe(false);
  });

  it('StepEvent validates level enum', () => {
    expect(StepEventSchema.safeParse({ title: 's', level: 'pass', offsetMs: 3 }).success).toBe(true);
    expect(StepEventSchema.safeParse({ title: 's', level: 'bogus', offsetMs: 3 }).success).toBe(false);
  });

  it('ApiEvent defaults attempt to 1', () => {
    const v = ApiEventSchema.parse({ method: 'GET', url: 'http://x', status: 200, durationMs: 5 });
    expect(v.attempt).toBe(1);
    expect(ApiEventSchema.safeParse({ method: 'GET', url: 'http://x', status: '200', durationMs: 5 }).success).toBe(false);
  });

  it('AiEvent validates feature and cache enums', () => {
    expect(AiEventSchema.safeParse({ feature: 'act', goal: 'g', cache: 'hit', durationMs: 1 }).success).toBe(true);
    expect(AiEventSchema.safeParse({ feature: 'x', goal: 'g', cache: 'hit', durationMs: 1 }).success).toBe(false);
    expect(AiEventSchema.safeParse({ feature: 'act', goal: 'g', cache: 'nope', durationMs: 1 }).success).toBe(false);
  });

  it('FlakinessEntry validates risk', () => {
    expect(FlakinessEntrySchema.safeParse({ id: 'a', title: 'a', runs: 1, failures: 0, flakyRuns: 0, failureRate: 0, risk: 'STABLE', avgDurationMs: 1 }).success).toBe(true);
    expect(FlakinessEntrySchema.safeParse({ id: 'a', title: 'a', runs: 1, failures: 0, flakyRuns: 0, failureRate: 0, risk: 'LOW', avgDurationMs: 1 }).success).toBe(false);
  });

  it('TestRecord keeps additive quarantineReason', () => {
    expect(TestRecordSchema.parse(makeTest({ quarantineReason: 'flaky login' })).quarantineReason).toBe('flaky login');
  });
});

describe('toAttachment', () => {
  it('returns a Buffer body with JSON payload and the content type', () => {
    const payload = heal();
    const att = toAttachment(CONTENT_TYPES.heal, payload);
    expect(Buffer.isBuffer(att.body)).toBe(true);
    expect(att.contentType).toBe('application/vnd.testfly.heal+json');
    expect(JSON.parse(att.body.toString('utf8'))).toEqual(payload);
  });

  it('round-trips arrays and unicode', () => {
    const att = toAttachment(CONTENT_TYPES.step, [{ title: 'ünï 🚀', level: 'info', offsetMs: 1 }]);
    expect(JSON.parse(att.body.toString('utf8'))[0].title).toBe('ünï 🚀');
  });

  it('defines all five content types under the testfly vendor tree', () => {
    expect(Object.keys(CONTENT_TYPES).sort()).toEqual(['ai', 'api', 'heal', 'meta', 'step']);
    for (const v of Object.values(CONTENT_TYPES)) expect(v).toMatch(/^application\/vnd\.testfly\.\w+\+json$/);
  });
});
