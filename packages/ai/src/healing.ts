import type { Locator } from '@playwright/test';
import { TestFlyError } from '@testfly/playwright';
import type { AiOptions, HealContext, HealResult, HealingStrategy } from '@testfly/playwright';
import { z } from 'zod';
import { TargetSpecSchema, describeTarget, targetToLocator } from './agent/plan';
import { formatPageContext, getPageContext } from './context/page-context';
import { resolveAiOptions } from './options';
import { elementSystemPrompt, healUserPrompt } from './prompts';
import { AiRuntime, newUsage } from './runtime';

const HealAnswerSchema = z.object({ target: TargetSpecSchema, confidence: z.number().min(0).max(1).default(0.7), reason: z.string().optional() });

/**
 * AI healing strategy (priority 100 — runs after rules and fuzzy).
 *
 * Asks the model for a semantic target using the ARIA snapshot, the original locator and the
 * intent; accepts it only if it matches exactly one element. Successful heals are cached in
 * `<cacheDir>/healed-locators.json` (key + original), so replays and CI cost nothing.
 *
 * @public
 */
export function createAiHealingStrategy(options: Partial<AiOptions> = {}): HealingStrategy {
  const resolved = resolveAiOptions(options);
  const runtime = new AiRuntime(resolved);

  return {
    name: 'ai',
    priority: 100,
    async heal(ctx: HealContext): Promise<HealResult | null> {
      runtime.assertEnabled('heal');
      const startedAt = Date.now();
      const usage = newUsage();
      const cacheKey = `${ctx.key}::${ctx.original}`;
      const unique = async (loc: Locator): Promise<boolean> => (await loc.count()) === 1;

      const hit = await runtime.caches.healed.get(cacheKey);
      if (hit) {
        const loc = targetToLocator(ctx.page, hit.target);
        if (await unique(loc)) {
          await runtime.attach('heal', ctx.key, 'hit', startedAt);
          return { locator: loc, description: hit.description, confidence: hit.confidence };
        }
        if (!runtime.live) throw runtime.cacheMiss(`A valid healed locator for "${ctx.key}"`, 'The cached healed locator no longer matches exactly one element.');
        await runtime.caches.healed.delete(cacheKey);
      }
      if (!runtime.live) throw runtime.cacheMiss(`A healed locator for "${ctx.key}"`);

      try {
        const page = await getPageContext(ctx.page, resolved.maxContextChars);
        const answer = await runtime.completeJson({
          system: elementSystemPrompt(),
          user: healUserPrompt({ key: ctx.key, original: ctx.original, intent: ctx.intent, definition: ctx.definition, pageContext: formatPageContext(page) }),
          schema: HealAnswerSchema,
          usage,
        });
        const loc = targetToLocator(ctx.page, answer.target);
        if (!(await unique(loc))) return null; // ambiguous or missing: never guess
        const description = describeTarget(answer.target);
        const confidence = Math.min(answer.confidence, 0.95);
        await runtime.caches.healed.set(cacheKey, { description, target: answer.target, confidence });
        return { locator: loc, description, confidence };
      } catch (err) {
        if (err instanceof TestFlyError && err.code === 'TF_AI_INVALID_RESPONSE') return null;
        throw err;
      } finally {
        await runtime.attach('heal', ctx.key, 'miss', startedAt, usage);
      }
    },
  };
}
