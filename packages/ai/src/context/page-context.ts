import type { Locator, Page } from '@playwright/test';
import { TestFlyError } from '@testfly/playwright';

/** @internal */
export interface PageContext {
  url: string;
  title: string;
  /** ARIA snapshot (YAML) trimmed to `maxChars`. */
  snapshot: string;
  truncated: boolean;
}

function isLocator(v: Page | Locator): v is Locator {
  return typeof (v as Locator).page === 'function';
}

const MASK = '[REDACTED:secret]';

/**
 * ARIA snapshots include the current value of text boxes (`- textbox "Password": hunter2`).
 * Mask the values of password inputs and of caller supplied secrets (e.g. `act()` params)
 * on textbox lines so typed secrets never reach the model through later page contexts.
 */
async function maskSecretValues(page: Page, snapshot: string, secrets: string[]): Promise<string> {
  const values = new Set(secrets.filter((v) => v.length >= 1));
  try {
    const typed = await page.evaluate(() => Array.from(document.querySelectorAll('input[type="password"]'), (i) => (i as HTMLInputElement).value));
    for (const v of typed) if (v) values.add(v);
  } catch {
    /* page navigating or closed: the snapshot was already taken, keep going */
  }
  if (!values.size) return snapshot;
  const variants = [...values].flatMap((v) => [v, JSON.stringify(v).slice(1, -1), JSON.stringify(v)]).sort((a, b) => b.length - a.length);
  return snapshot
    .split('\n')
    .map((line) => {
      if (!/^\s*- textbox\b/.test(line)) return line;
      let out = line;
      for (const v of variants) out = out.split(v).join(MASK);
      return out;
    })
    .join('\n');
}

/**
 * Build the text context sent to the model: URL, title and the ARIA snapshot of the page
 * (or of a single locator). Requires Playwright >= 1.49.
 *
 * @internal
 */
export async function getPageContext(scope: Page | Locator, maxChars: number, secrets: string[] = []): Promise<PageContext> {
  const page = isLocator(scope) ? scope.page() : scope;
  const target = isLocator(scope) ? scope : page.locator('body');
  let snapshot: string;
  try {
    snapshot = await target.ariaSnapshot();
  } catch (cause) {
    throw new TestFlyError('TF_INTERNAL', 'Could not read the ARIA snapshot of the page.', {
      hint: 'ariaSnapshot needs @playwright/test >= 1.49 and an attached element.',
      cause,
    });
  }
  snapshot = await maskSecretValues(page, snapshot, secrets);
  const title = await page.title().catch(() => '');
  const truncated = snapshot.length > maxChars;
  return { url: page.url(), title, snapshot: truncated ? `${snapshot.slice(0, maxChars)}\n…[truncated]` : snapshot, truncated };
}

/** Render a {@link PageContext} for a prompt. @internal */
export function formatPageContext(ctx: PageContext): string {
  return `URL: ${ctx.url}\nTitle: ${ctx.title}\n\nARIA snapshot:\n${ctx.snapshot}`;
}
