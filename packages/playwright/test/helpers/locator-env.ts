import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page, type TestInfo } from '@playwright/test';

export function launchChromium(): Promise<Browser> {
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
}

export interface FakeTestInfo {
  info: TestInfo;
  attachments: Array<{ name: string; contentType?: string; body?: Buffer | string }>;
}

export function fakeTestInfo(): FakeTestInfo {
  const attachments: FakeTestInfo['attachments'] = [];
  const info = {
    annotations: [] as Array<{ type: string; description?: string }>,
    titlePath: ['fake', 'test'],
    file: '/fake/test.spec.ts',
    project: { name: 'fake' },
    attach: async (name: string, opts: { contentType?: string; body?: Buffer | string }) => {
      attachments.push({ name, ...opts });
    },
  } as unknown as TestInfo;
  return { info, attachments };
}

/** Write `{ file: content }` into a fresh temp dir. */
export function tmpCatalog(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-loc-'));
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c, 'utf8');
  return dir;
}

export async function newPage(browser: Browser, html: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent(html);
  return page;
}
