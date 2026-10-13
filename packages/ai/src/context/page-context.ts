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

/**
 * Build the text context sent to the model: URL, title and the ARIA snapshot of the page
 * (or of a single locator). Requires Playwright >= 1.49.
 *
 * @internal
 */
export async function getPageContext(scope: Page | Locator, maxChars: number): Promise<PageContext> {
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
  const title = await page.title().catch(() => '');
  const truncated = snapshot.length > maxChars;
  return { url: page.url(), title, snapshot: truncated ? `${snapshot.slice(0, maxChars)}\n…[truncated]` : snapshot, truncated };
}

/** Render a {@link PageContext} for a prompt. @internal */
export function formatPageContext(ctx: PageContext): string {
  return `URL: ${ctx.url}\nTitle: ${ctx.title}\n\nARIA snapshot:\n${ctx.snapshot}`;
}
