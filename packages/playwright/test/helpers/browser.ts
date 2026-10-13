import { chromium, type Browser } from '@playwright/test';

/** Launch chromium from the sandbox path (override with PW_CHROMIUM_PATH). */
export function launchChromium(): Promise<Browser> {
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
}
