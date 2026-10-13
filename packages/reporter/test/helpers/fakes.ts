import type { FullConfig, FullResult, TestCase, TestResult } from '@playwright/test/reporter';

export interface FakeAttachment { name: string; contentType: string; body?: Buffer; path?: string }
export interface FakeResultInit {
  retry?: number;
  status?: TestResult['status'];
  duration?: number;
  attachments?: FakeAttachment[];
  annotations?: Array<{ type: string; description?: string }>;
  error?: { message?: string; stack?: string; snippet?: string; value?: string };
}

export const ROOT = '/proj';

export function fakeConfig(over: Partial<{ shard: { current: number; total: number } | null; rootDir: string; version: string }> = {}): FullConfig {
  return { rootDir: over.rootDir ?? ROOT, version: over.version ?? '1.64.0', shard: over.shard ?? null } as unknown as FullConfig;
}

export function fakeResult(init: FakeResultInit = {}): TestResult {
  return {
    retry: init.retry ?? 0,
    status: init.status ?? 'passed',
    duration: init.duration ?? 100,
    attachments: init.attachments ?? [],
    annotations: init.annotations ?? [],
    error: init.error,
    errors: init.error ? [init.error] : [],
    steps: [],
    stdout: [],
    stderr: [],
    startTime: new Date(),
    parallelIndex: 0,
    workerIndex: 0,
  } as unknown as TestResult;
}

export function fakeTest(init: {
  file?: string;
  line?: number;
  project?: string;
  describes?: string[];
  title: string;
  outcome: ReturnType<TestCase['outcome']>;
  tags?: string[];
  annotations?: Array<{ type: string; description?: string }>;
}): TestCase {
  const file = init.file ?? `${ROOT}/tests/a.spec.ts`;
  const project = init.project ?? 'chromium';
  const titlePath = ['', project, 'tests/a.spec.ts', ...(init.describes ?? []), init.title];
  return {
    title: init.title,
    titlePath: () => titlePath,
    location: { file, line: init.line ?? 3, column: 1 },
    parent: { project: () => ({ name: project }) },
    outcome: () => init.outcome,
    annotations: init.annotations ?? [],
    tags: init.tags ?? [],
  } as unknown as TestCase;
}

export function fullResult(status: FullResult['status'] = 'passed', duration = 1234): FullResult {
  return { status, startTime: new Date(), duration } as FullResult;
}

export function json(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload));
}
