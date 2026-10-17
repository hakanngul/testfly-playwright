import { chromium } from '@playwright/test';
import type { Browser } from '@playwright/test';

export function launch(): Promise<Browser> {
  return chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
}
