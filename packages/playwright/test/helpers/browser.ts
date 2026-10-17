import { chromium, type Browser } from '@playwright/test';

/** Launch chromium (Playwright's bundled build, or PW_CHROMIUM_PATH when set). */
export function launchChromium(): Promise<Browser> {
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
}
