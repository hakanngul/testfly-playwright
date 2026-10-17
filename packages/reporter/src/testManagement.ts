import type { RunRecord, TestRecord } from './schema';

/**
 * TestRail sync. Tests are linked by tag: `test('login', { tag: '@C1234' }, …)` or `@C1234` in the title.
 * With `runId` results go to that run; with `projectId` (and optional `suiteId`) a new run containing the
 * linked cases is created first.
 *
 * @public
 */
export interface TestRailOptions {
  /** Base URL, e.g. `https://acme.testrail.io`. */
  url: string;
  user: string;
  /** API key (or password). Use an env placeholder: `'${TESTRAIL_API_KEY}'`. */
  apiKey: string;
  runId?: number;
  projectId?: number;
  suiteId?: number;
  /** Name of a created run. Default: `Playwright run <ISO date>`. */
  runName?: string;
  /** Close a run this reporter created. Default false. */
  closeRun?: boolean;
}

/**
 * Xray Cloud sync (Jira Cloud). Tests are linked by tag: `@PROJ-123` (a Jira issue key).
 * Results are imported as a Test Execution (`testExecutionKey` to update an existing one).
 *
 * @public
 */
export interface XrayOptions {
  clientId: string;
  clientSecret: string;
  /** Jira project key of a newly created Test Execution. */
  projectKey?: string;
  testExecutionKey?: string;
  testPlanKey?: string;
  /** Summary of a created Test Execution. Default: `Playwright run <ISO date>`. */
  summary?: string;
  /** Default `https://xray.cloud.getxray.app`. */
  baseUrl?: string;
}

/** @public */
export interface TestManagementOptions {
  testrail?: TestRailOptions;
  xray?: XrayOptions;
}

/** Outcome of one sync. @public */
export interface SyncResult {
  target: 'testrail' | 'xray';
  /** Results sent. */
  sent: number;
  /** Where they went (run id / execution key) when known. */
  reference?: string;
}

type Fetch = typeof fetch;

const TESTRAIL_TAG = /^@C(\d+)$/i;
const JIRA_TAG = /^@([A-Z][A-Z0-9_]+-\d+)$/;

/** TestRail case ids linked to a test. @internal */
export function testRailCaseIds(test: TestRecord): number[] {
  return [...new Set(test.tags.map((t) => TESTRAIL_TAG.exec(t)?.[1]).filter((v): v is string => !!v).map(Number))];
}

/** Jira issue keys linked to a test. @internal */
export function jiraKeys(test: TestRecord): string[] {
  return [...new Set(test.tags.map((t) => JIRA_TAG.exec(t)?.[1]).filter((v): v is string => !!v))];
}

/** Tests with a final outcome worth reporting (skipped tests are left untouched). */
function reportable(run: RunRecord): TestRecord[] {
  return run.tests.filter((t) => t.status !== 'skipped' && !t.quarantined);
}

function comment(test: TestRecord): string {
  const head = test.flaky ? 'Passed after a retry (flaky).' : test.status === 'passed' ? 'Passed.' : `${test.status === 'timedOut' ? 'Timed out' : 'Failed'}.`;
  const error = test.error ? `\n\n${test.error.message.slice(0, 2_000)}` : '';
  return `${head} Playwright: ${test.titlePath.join(' › ') || test.title} [${test.project}]${error}`;
}

async function request(fetchImpl: Fetch, url: string, init: RequestInit, what: string): Promise<unknown> {
  const res = await fetchImpl(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${what} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return text;
  }
}

/** Push results of linked tests to TestRail. @internal */
export async function syncTestRail(run: RunRecord, options: TestRailOptions, fetchImpl: Fetch = fetch): Promise<SyncResult> {
  const results = reportable(run).flatMap((t) =>
    testRailCaseIds(t).map((caseId) => ({
      case_id: caseId,
      // 1 = Passed, 5 = Failed
      status_id: t.status === 'passed' ? 1 : 5,
      comment: comment(t),
      elapsed: `${Math.max(1, Math.round(t.durationMs / 1000))}s`,
    })),
  );
  if (!results.length) return { target: 'testrail', sent: 0 };

  const base = `${options.url.replace(/\/+$/, '')}/index.php?/api/v2`;
  const headers = {
    'content-type': 'application/json',
    authorization: `Basic ${Buffer.from(`${options.user}:${options.apiKey}`).toString('base64')}`,
  };
  let runId = options.runId;
  let created = false;
  if (runId === undefined) {
    if (options.projectId === undefined) throw new Error('testrail needs runId or projectId');
    const run_ = (await request(
      fetchImpl,
      `${base}/add_run/${options.projectId}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: options.runName ?? `Playwright run ${new Date(run.startedAt).toISOString()}`,
          suite_id: options.suiteId,
          include_all: false,
          case_ids: [...new Set(results.map((r) => r.case_id))],
        }),
      },
      'TestRail add_run',
    )) as { id?: number };
    if (typeof run_?.id !== 'number') throw new Error('TestRail add_run returned no run id');
    runId = run_.id;
    created = true;
  }
  await request(fetchImpl, `${base}/add_results_for_cases/${runId}`, { method: 'POST', headers, body: JSON.stringify({ results }) }, 'TestRail add_results_for_cases');
  if (created && options.closeRun) {
    await request(fetchImpl, `${base}/close_run/${runId}`, { method: 'POST', headers, body: '{}' }, 'TestRail close_run');
  }
  return { target: 'testrail', sent: results.length, reference: `R${runId}` };
}

/** Import results of linked tests into Xray Cloud as a Test Execution. @internal */
export async function syncXray(run: RunRecord, options: XrayOptions, fetchImpl: Fetch = fetch): Promise<SyncResult> {
  const finish = new Date(run.startedAt + run.durationMs).toISOString();
  const tests = reportable(run).flatMap((t) =>
    jiraKeys(t).map((testKey) => ({
      testKey,
      status: t.status === 'passed' ? 'PASSED' : 'FAILED',
      comment: comment(t),
      start: new Date(run.startedAt).toISOString(),
      finish,
    })),
  );
  if (!tests.length) return { target: 'xray', sent: 0 };
  if (!options.testExecutionKey && !options.projectKey) throw new Error('xray needs projectKey or testExecutionKey');

  const base = (options.baseUrl ?? 'https://xray.cloud.getxray.app').replace(/\/+$/, '');
  const token = await request(
    fetchImpl,
    `${base}/api/v2/authenticate`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: options.clientId, client_secret: options.clientSecret }) },
    'Xray authenticate',
  );
  if (typeof token !== 'string' || !token) throw new Error('Xray authenticate returned no token');
  const body = {
    ...(options.testExecutionKey ? { testExecutionKey: options.testExecutionKey } : {}),
    info: {
      ...(options.projectKey ? { project: options.projectKey } : {}),
      summary: options.summary ?? `Playwright run ${new Date(run.startedAt).toISOString()}`,
      ...(options.testPlanKey ? { testPlanKey: options.testPlanKey } : {}),
      startDate: new Date(run.startedAt).toISOString(),
      finishDate: finish,
    },
    tests,
  };
  const out = (await request(
    fetchImpl,
    `${base}/api/v2/import/execution`,
    { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) },
    'Xray import',
  )) as { key?: string } | undefined;
  return { target: 'xray', sent: tests.length, reference: out?.key ?? options.testExecutionKey };
}

/** Run every configured sync; failures are returned, never thrown. @internal */
export async function syncTestManagement(
  run: RunRecord,
  options: TestManagementOptions,
  fetchImpl: Fetch = fetch,
): Promise<{ results: SyncResult[]; errors: string[] }> {
  const jobs: Array<Promise<SyncResult>> = [];
  if (options.testrail) jobs.push(syncTestRail(run, options.testrail, fetchImpl));
  if (options.xray) jobs.push(syncXray(run, options.xray, fetchImpl));
  const settled = await Promise.allSettled(jobs);
  const results: SyncResult[] = [];
  const errors: string[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') results.push(s.value);
    else errors.push((s.reason as Error)?.message ?? String(s.reason));
  }
  return { results, errors };
}
