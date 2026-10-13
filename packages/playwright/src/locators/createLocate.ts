import type { Locator, Page, TestInfo } from '@playwright/test';
import { CONTENT_TYPES, toAttachment, type HealEvent } from '@testfly/reporter/schema';
import type { AiOptions, HealingOptions } from '../core/config/schema';
import { describeDef } from './describe';
import { buildLocator } from './build';
import type { LocatorRegistry } from './LocatorRegistry';
import { buildStrategies, runHealing } from './healing/runner';
import type { LocatorDef, TypedLocatorKey } from './types';

/**
 * The `locate` fixture.
 *
 * - `locate(key)` — plain Playwright {@link Locator} (primary definition + YAML `fallbacks`), no healing.
 * - `await locate.resolve(key)` — waits (default 2000 ms) for the locator to attach, otherwise heals.
 * - `await locate.heal(key)` — heals immediately when the locator matches nothing.
 *
 * Healing order: primary → YAML fallbacks → strategies by priority (rules 10, fuzzy 20, ai 100).
 * @public
 */
export type LocateFn = ((key: TypedLocatorKey) => Locator) & {
  resolve(key: TypedLocatorKey, opts?: { timeout?: number }): Promise<Locator>;
  heal(key: TypedLocatorKey): Promise<Locator>;
};

/** @public */
export interface CreateLocateArgs {
  page: Page;
  testInfo: TestInfo;
  registry: LocatorRegistry;
  healing: HealingOptions;
  ai: AiOptions;
}

const humanize = (s: string): string => s.replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

function intentOf(key: string, def: LocatorDef): string {
  const parts = [humanize(key.split('.').pop() ?? key), def.role, def.name, def.label, def.text, def.placeholder, def.alt, def.title, def.testid];
  return [...new Set(parts.filter((p): p is string => !!p))].join(' ');
}

/**
 * Create the `locate` function bound to a page/test.
 * @public
 */
export function createLocate({ page, testInfo, registry, healing, ai }: CreateLocateArgs): LocateFn {
  const healed = new Map<string, Locator>();
  const lookup = (k: string): LocatorDef | undefined => registry.get(k);
  const plain = (key: string): Locator => buildLocator(page, registry.require(key), lookup);

  const locate = ((key: TypedLocatorKey): Locator => plain(key)) as LocateFn;

  locate.heal = async (key: TypedLocatorKey): Promise<Locator> => {
    const chain = plain(key);
    if (healing.mode === 'off') return chain;
    if ((await chain.count()) > 0) return chain;

    const cached = healed.get(key);
    if (cached && (await cached.count()) > 0) return cached;

    const def = registry.require(key);
    const original = describeDef(def);
    const strategies = await buildStrategies(healing, ai);
    const outcome = await runHealing({ page, key, original, definition: def, intent: intentOf(key, def) }, strategies);

    const event: HealEvent = {
      key,
      original,
      healed: outcome.description,
      strategy: outcome.strategy,
      confidence: Math.max(0, Math.min(1, outcome.confidence)),
      url: page.url(),
      timestamp: Date.now(),
    };
    const attachment = toAttachment(CONTENT_TYPES.heal, event);
    await testInfo.attach('testfly-heal', attachment);
    testInfo.annotations.push({ type: 'healed', description: `${key}: ${original} → ${outcome.description}` });
    healed.set(key, outcome.locator);
    return outcome.locator;
  };

  locate.resolve = async (key: TypedLocatorKey, opts: { timeout?: number } = {}): Promise<Locator> => {
    const chain = plain(key);
    if (healing.mode === 'off') return chain;
    if (healed.has(key)) return locate.heal(key);
    try {
      await chain.first().waitFor({ state: 'attached', timeout: opts.timeout ?? 2000 });
      return chain;
    } catch {
      return locate.heal(key);
    }
  };

  return locate;
}
