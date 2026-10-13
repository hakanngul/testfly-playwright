import type { Locator, Page } from '@playwright/test';
import type { HealEvent } from '@testfly/reporter/schema';

/**
 * Healing contracts (ADR-001 D5).
 *
 * Order of resolution for `locate(key)`:
 *   1. primary definition from YAML
 *   2. explicit `fallbacks:` in YAML (SmartLocator equivalent)
 *   3. registered strategies by ascending `priority` (rules → fuzzy → ai)
 *
 * Every successful heal produces a {@link HealEvent} that is attached to the test
 * as `application/vnd.testfly.heal+json` and aggregated by @testfly/reporter.
 *
 * @public
 */
export interface HealContext {
  page: Page;
  /** Locator key, e.g. `login.submit`. */
  key: string;
  /** Human readable description of the failed primary locator (e.g. `getByRole('button', { name: 'Login' })`). */
  original: string;
  /** Raw definition from YAML, if any. */
  definition?: unknown;
  /** Intent text useful for semantic strategies (key name, role/name, label…). */
  intent: string;
  signal?: AbortSignal;
}

/** @public */
export interface HealResult {
  locator: Locator;
  /** Description of the healed locator, stored in the heal log. */
  description: string;
  /** 0..1 */
  confidence: number;
}

/** @public */
export interface HealingStrategy {
  /** e.g. `rules`, `fuzzy`, `ai` */
  readonly name: string;
  /** Lower runs first. rules=10, fuzzy=20, ai=100. */
  readonly priority: number;
  heal(ctx: HealContext): Promise<HealResult | null>;
}

export type { HealEvent };
