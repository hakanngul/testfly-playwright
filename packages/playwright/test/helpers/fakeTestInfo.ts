import type { TestInfo } from '@playwright/test';

export interface RecordedAttachment {
  name: string;
  body?: string | Buffer;
  contentType?: string;
}

export interface FakeTestInfo extends TestInfo {
  attachments_: RecordedAttachment[];
}

/** Minimal TestInfo double: records `attach` calls. */
export function fakeTestInfo(overrides: Record<string, unknown> = {}): FakeTestInfo {
  const attachments_: RecordedAttachment[] = [];
  const info = {
    attachments_,
    annotations: [],
    tags: [],
    titlePath: ['file.spec.ts', 'suite', 'test'],
    file: '/project/tests/file.spec.ts',
    project: { name: 'chromium' },
    config: { configFile: '/project/playwright.config.ts' },
    attach: async (name: string, options: { body?: string | Buffer; contentType?: string } = {}) => {
      attachments_.push({ name, body: options.body, contentType: options.contentType });
    },
    ...overrides,
  };
  return info as unknown as FakeTestInfo;
}
