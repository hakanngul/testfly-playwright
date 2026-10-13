import type { TestInfo } from '@playwright/test';

export interface Attached {
  name: string;
  contentType?: string;
  body?: Buffer | string;
}

/** Minimal fake TestInfo recording attachments. */
export function fakeTestInfo(rootDir = process.cwd()): TestInfo & { attachments: Attached[] } {
  const attachments: Attached[] = [];
  const info = {
    attachments,
    annotations: [],
    titlePath: ['file.spec.ts', 'suite', 'test'],
    file: `${rootDir}/file.spec.ts`,
    config: { rootDir },
    project: { name: 'chromium' },
    async attach(name: string, opts: { body?: Buffer | string; contentType?: string }) {
      attachments.push({ name, body: opts.body, contentType: opts.contentType });
    },
  };
  return info as unknown as TestInfo & { attachments: Attached[] };
}

export function aiEvents(info: { attachments: Attached[] }): Record<string, unknown>[] {
  return info.attachments.filter((a) => a.name.startsWith('testfly-ai-')).map((a) => JSON.parse(String(a.body)));
}
