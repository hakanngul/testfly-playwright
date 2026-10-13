import type { Locator, Page } from '@playwright/test';
import { TestFlyError } from '../core/errors';
import type { LocatorDef } from './types';

/** Resolves another locator definition by key (used for `within`). @internal */
export type DefLookup = (key: string) => LocatorDef | undefined;

type Root = Page | Locator;

function buildOne(root: Root, def: LocatorDef): Locator {
  const exact = def.exact;
  let loc: Locator;
  if (def.role !== undefined) {
    // Role names are free-form in YAML; Playwright validates them at match time.
    loc = root.getByRole(def.role as Parameters<Page['getByRole']>[0], {
      ...(def.name !== undefined ? { name: def.name } : {}),
      ...(exact !== undefined ? { exact } : {}),
      ...(def.level !== undefined ? { level: def.level } : {}),
    });
  } else if (def.label !== undefined) loc = root.getByLabel(def.label, { exact });
  else if (def.text !== undefined) loc = root.getByText(def.text, { exact });
  else if (def.testid !== undefined) loc = root.getByTestId(def.testid);
  else if (def.placeholder !== undefined) loc = root.getByPlaceholder(def.placeholder, { exact });
  else if (def.alt !== undefined) loc = root.getByAltText(def.alt, { exact });
  else if (def.title !== undefined) loc = root.getByTitle(def.title, { exact });
  else if (def.xpath !== undefined) loc = root.locator(`xpath=${def.xpath}`);
  else loc = root.locator(def.css ?? '');

  if (def.has_text !== undefined) loc = loc.filter({ hasText: def.has_text });
  if (def.nth !== undefined) loc = loc.nth(def.nth);
  if (def.first) loc = loc.first();
  if (def.last) loc = loc.last();
  return loc;
}

/**
 * Build the Playwright locator for a definition: resolves `within` chains and joins
 * explicit `fallbacks` with `.or()` (+ `.first()` to avoid strict-mode violations).
 * @internal
 */
export function buildLocator(page: Page, def: LocatorDef, lookup: DefLookup, chain: string[] = []): Locator {
  const rootFor = (d: LocatorDef): Root => {
    if (!d.within) return page;
    if (chain.includes(d.within)) {
      throw new TestFlyError('TF_LOCATOR_INVALID', `Circular "within" chain: ${[...chain, d.within].join(' → ')}`);
    }
    const parent = lookup(d.within);
    if (!parent) {
      throw new TestFlyError('TF_LOCATOR_NOT_FOUND', `"within: ${d.within}" does not exist in the locator catalog.`, {
        hint: 'Use the full key of an existing locator, e.g. "login.form".',
      });
    }
    return buildLocator(page, parent, lookup, [...chain, d.within]);
  };

  const root = rootFor(def);
  let loc = buildOne(root, def);
  const fallbacks = def.fallbacks ?? [];
  for (const fb of fallbacks) loc = loc.or(buildOne(fb.within ? rootFor(fb) : root, fb));
  return fallbacks.length ? loc.first() : loc;
}
