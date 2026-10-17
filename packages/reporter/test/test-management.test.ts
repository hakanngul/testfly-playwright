import { describe, expect, it, vi } from 'vitest';
import { jiraKeys, syncTestManagement, syncTestRail, syncXray, testRailCaseIds } from '../src/testManagement';
import { makeRun, makeTest } from './helpers/records';

interface Call {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: any;
}

/** Fake fetch that records calls and answers from a table of url-substring → response. */
function fakeFetch(routes: Array<[string, { status?: number; body: unknown }]>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const hit = routes.find(([k]) => u.includes(k));
    const status = hit?.[1].status ?? (hit ? 200 : 404);
    return new Response(hit ? JSON.stringify(hit[1].body) : 'not found', { status });
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

const run = makeRun(
  [
    makeTest({ title: 'login works', tags: ['@C101', '@smoke', '@PROJ-1'], durationMs: 2_400 }),
    makeTest({ title: 'checkout fails', tags: ['@C102', '@PROJ-2'], status: 'failed', error: { message: 'Expected 200 but got 500' } }),
    makeTest({ title: 'flaky search', tags: ['@C103'], flaky: true }),
    makeTest({ title: 'skipped one', tags: ['@C104', '@PROJ-4'], status: 'skipped' }),
    makeTest({ title: 'quarantined one', tags: ['@C105'], status: 'failed', quarantined: true }),
    makeTest({ title: 'unlinked', tags: ['@smoke'] }),
  ],
  { startedAt: Date.UTC(2026, 9, 17, 10, 0, 0) },
);

describe('tag mapping', () => {
  it('reads TestRail case ids and Jira keys from tags only', () => {
    expect(testRailCaseIds(makeTest({ tags: ['@C12', '@c7', '@C12', '@CX', '@PROJ-3'] }))).toEqual([12, 7]);
    expect(jiraKeys(makeTest({ tags: ['@PROJ-3', '@proj-4', '@C12', '@AB_1-99'] }))).toEqual(['PROJ-3', 'AB_1-99']);
  });
});

describe('TestRail', () => {
  it('posts results for linked, executed, non-quarantined tests to an existing run', async () => {
    const { calls, impl } = fakeFetch([['add_results_for_cases/77', { body: [] }]]);
    const res = await syncTestRail(run, { url: 'https://acme.testrail.io/', user: 'qa@acme.io', apiKey: 'k3y', runId: 77 }, impl);
    expect(res).toEqual({ target: 'testrail', sent: 3, reference: 'R77' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://acme.testrail.io/index.php?/api/v2/add_results_for_cases/77');
    expect(calls[0]!.headers.authorization).toBe(`Basic ${Buffer.from('qa@acme.io:k3y').toString('base64')}`);
    const results = calls[0]!.body.results;
    expect(results.map((r: any) => [r.case_id, r.status_id])).toEqual([[101, 1], [102, 5], [103, 1]]);
    expect(results[1].comment).toContain('Expected 200 but got 500');
    expect(results[2].comment).toContain('flaky');
    expect(results[0].elapsed).toBe('2s');
  });

  it('creates (and optionally closes) a run when only projectId is given', async () => {
    const { calls, impl } = fakeFetch([
      ['add_run/3', { body: { id: 900 } }],
      ['add_results_for_cases/900', { body: [] }],
      ['close_run/900', { body: {} }],
    ]);
    const res = await syncTestRail(run, { url: 'https://t', user: 'u', apiKey: 'k', projectId: 3, suiteId: 9, runName: 'Nightly', closeRun: true }, impl);
    expect(res.reference).toBe('R900');
    expect(calls.map((c) => c.url.split('/api/v2/')[1])).toEqual(['add_run/3', 'add_results_for_cases/900', 'close_run/900']);
    expect(calls[0]!.body).toEqual({ name: 'Nightly', suite_id: 9, include_all: false, case_ids: [101, 102, 103] });
  });

  it('sends nothing when no test is linked', async () => {
    const { calls, impl } = fakeFetch([]);
    const res = await syncTestRail(makeRun([makeTest({ tags: ['@smoke'] })]), { url: 'https://t', user: 'u', apiKey: 'k', runId: 1 }, impl);
    expect(res.sent).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe('Xray Cloud', () => {
  it('authenticates and imports a new Test Execution', async () => {
    const { calls, impl } = fakeFetch([
      ['/api/v2/authenticate', { body: 'tok-123' }],
      ['/api/v2/import/execution', { body: { key: 'PROJ-50' } }],
    ]);
    const res = await syncXray(run, { clientId: 'id', clientSecret: 'sec', projectKey: 'PROJ', testPlanKey: 'PROJ-9' }, impl);
    expect(res).toEqual({ target: 'xray', sent: 2, reference: 'PROJ-50' });
    expect(calls[0]!.body).toEqual({ client_id: 'id', client_secret: 'sec' });
    expect(calls[1]!.headers.authorization).toBe('Bearer tok-123');
    const body = calls[1]!.body;
    expect(body.info).toMatchObject({ project: 'PROJ', testPlanKey: 'PROJ-9', startDate: '2026-10-17T10:00:00.000Z' });
    expect(body.tests.map((t: any) => [t.testKey, t.status])).toEqual([['PROJ-1', 'PASSED'], ['PROJ-2', 'FAILED']]);
    expect(body.testExecutionKey).toBeUndefined();
  });

  it('updates an existing Test Execution', async () => {
    const { calls, impl } = fakeFetch([
      ['authenticate', { body: 'tok' }],
      ['import/execution', { body: {} }],
    ]);
    const res = await syncXray(run, { clientId: 'id', clientSecret: 'sec', testExecutionKey: 'PROJ-77', baseUrl: 'https://eu.xray.cloud.getxray.app/' }, impl);
    expect(res.reference).toBe('PROJ-77');
    expect(calls[0]!.url).toBe('https://eu.xray.cloud.getxray.app/api/v2/authenticate');
    expect(calls[1]!.body.testExecutionKey).toBe('PROJ-77');
  });
});

describe('syncTestManagement', () => {
  it('runs both targets and collects failures instead of throwing (no secrets in the message)', async () => {
    const { impl } = fakeFetch([
      ['add_results_for_cases', { status: 401, body: { error: 'Authentication failed' } }],
      ['authenticate', { body: 'tok' }],
      ['import/execution', { body: { key: 'PROJ-1' } }],
    ]);
    const { results, errors } = await syncTestManagement(
      run,
      { testrail: { url: 'https://t', user: 'u', apiKey: 'super-secret', runId: 5 }, xray: { clientId: 'i', clientSecret: 'also-secret', projectKey: 'PROJ' } },
      impl,
    );
    expect(results).toEqual([{ target: 'xray', sent: 2, reference: 'PROJ-1' }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('TestRail add_results_for_cases failed: HTTP 401');
    expect(errors.join()).not.toMatch(/secret/);
  });
});
