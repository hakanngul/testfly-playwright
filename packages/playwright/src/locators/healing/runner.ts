import { TestFlyError, importOptional } from '../../core/errors';
import type { AiOptions, HealingOptions } from '../../core/config/schema';
import { FuzzyStrategy } from './FuzzyStrategy';
import { RulesStrategy } from './RulesStrategy';
import { getRegisteredStrategies } from './registry';
import type { HealContext, HealingStrategy, HealResult } from './types';

/** Result of a successful healing run. @internal */
export interface HealOutcome extends HealResult {
  strategy: string;
}

/** Build the ordered strategy list for the configured mode. @internal */
export async function buildStrategies(healing: HealingOptions, ai: AiOptions): Promise<HealingStrategy[]> {
  const list: HealingStrategy[] = [new RulesStrategy(), new FuzzyStrategy(healing.fuzzyThreshold), ...getRegisteredStrategies()];
  if (healing.mode === 'ai') {
    // Throws a helpful TF_OPTIONAL_DEPENDENCY_MISSING when @testfly/ai is not installed.
    const mod = await importOptional<{ createAiHealingStrategy(options: AiOptions): HealingStrategy }>('@testfly/ai', 'AI healing');
    list.push(mod.createAiHealingStrategy(ai));
  }
  return list.sort((a, b) => a.priority - b.priority);
}

/**
 * Run strategies in priority order and return the first verified locator.
 * Throws `TF_HEALING_FAILED` when none succeeds.
 * @internal
 */
export async function runHealing(ctx: HealContext, strategies: HealingStrategy[]): Promise<HealOutcome> {
  const tried: string[] = [];
  for (const s of strategies) {
    try {
      const result = await s.heal(ctx);
      if (result && (await result.locator.count()) > 0) return { ...result, strategy: s.name };
      tried.push(`${s.name}: no match`);
    } catch (err) {
      // Configuration / AI errors (e.g. TF_AI_CACHE_MISS) must surface, anything else is a strategy miss.
      if (err instanceof TestFlyError) throw err;
      tried.push(`${s.name}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  throw new TestFlyError('TF_HEALING_FAILED', `Could not find "${ctx.key}" (${ctx.original}) and healing failed.\n  Tried: ${tried.join('; ') || 'no strategies'}`, {
    hint: `The element may have changed. Update locators/${ctx.key.split('.')[0]}.yaml (key "${ctx.key.split('.').slice(1).join('.')}") or add "fallbacks".`,
    details: { key: ctx.key, original: ctx.original, tried },
  });
}
