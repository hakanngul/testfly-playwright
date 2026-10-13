import type { HealingStrategy } from './types';

const extra: HealingStrategy[] = [];

/**
 * Register a custom healing strategy (runs ordered by `priority`, alongside rules=10, fuzzy=20, ai=100).
 * Registering a strategy with an existing `name` replaces it.
 * @public
 */
export function registerHealingStrategy(strategy: HealingStrategy): void {
  const i = extra.findIndex((s) => s.name === strategy.name);
  if (i >= 0) extra[i] = strategy;
  else extra.push(strategy);
}

/** Remove a previously registered custom strategy. @public */
export function unregisterHealingStrategy(name: string): boolean {
  const i = extra.findIndex((s) => s.name === name);
  if (i < 0) return false;
  extra.splice(i, 1);
  return true;
}

/** Custom strategies registered so far. @internal */
export function getRegisteredStrategies(): readonly HealingStrategy[] {
  return extra;
}
