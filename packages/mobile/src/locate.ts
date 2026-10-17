import { TestFlyError } from '@testfly/playwright';
import { selectPlatformDef, type LocatorDef, type LocatorRegistry, type MobileLocatorDef } from '@testfly/playwright/locators';
import type { Locator as MobileLocator, Role, Screen } from 'mobilewright';

/** `mobileLocate(key)`: a YAML locator key resolved to a Mobilewright locator for the current platform. @public */
export type MobileLocateFn = (key: string) => MobileLocator;

type Root = Screen | MobileLocator;

function buildOne(root: Root, def: MobileLocatorDef): MobileLocator {
  const exact = def.exact !== undefined ? { exact: def.exact } : undefined;
  let loc: MobileLocator;
  if (def.role !== undefined) loc = root.getByRole(def.role as Role, def.name !== undefined ? { name: def.name } : undefined);
  else if (def.label !== undefined) loc = root.getByLabel(def.label, exact);
  else if (def.text !== undefined) loc = root.getByText(def.text, exact);
  else if (def.testid !== undefined) loc = root.getByTestId(def.testid);
  else if (def.placeholder !== undefined) loc = root.getByPlaceholder(def.placeholder, exact);
  else loc = root.getByType(def.type ?? '');
  if (def.has_text !== undefined) loc = loc.filter({ hasText: def.has_text });
  if (def.nth !== undefined) loc = loc.nth(def.nth);
  if (def.first) loc = loc.first();
  if (def.last) loc = loc.last();
  return loc;
}

/**
 * Build the Mobilewright locator of `key` for `platform`: platform block → `mobile:` block → shared
 * definition (when it only uses mobile fields). Resolves `within` chains (scoped `getBy*`) and joins
 * `fallbacks` with `.or()` + `.first()`.
 *
 * @internal
 */
export function buildMobileLocator(screen: Screen, registry: LocatorRegistry, key: string, platform: 'ios' | 'android', chain: string[] = []): MobileLocator {
  const def: LocatorDef = registry.require(key);
  const mobile = selectPlatformDef(def, platform);
  if (!mobile) {
    throw new TestFlyError('TF_LOCATOR_NOT_FOUND', `Locator "${key}" has no ${platform} definition.`, {
      hint: `Add an "${platform}:" (or "mobile:") block to the YAML entry; web-only selectors (css, xpath, alt, title) cannot be used on a device.`,
      details: { key, platform },
    });
  }
  let root: Root = screen;
  if (mobile.within) {
    if (chain.includes(mobile.within)) {
      throw new TestFlyError('TF_LOCATOR_INVALID', `Circular "within" chain: ${[...chain, key, mobile.within].join(' → ')}`);
    }
    root = buildMobileLocator(screen, registry, mobile.within, platform, [...chain, key]);
  }
  let loc = buildOne(root, mobile);
  const fallbacks = mobile.fallbacks ?? [];
  for (const fb of fallbacks) loc = loc.or(buildOne(root, fb));
  return fallbacks.length ? loc.first() : loc;
}
