import type { Locator, Page } from '@playwright/test';
import { TestFlyError } from '@testfly/playwright';
import type { AiEvent } from '@testfly/reporter/schema';
import { z } from 'zod';
import { intentKey, actionKey, urlPattern } from '../cache/keys';
import type { ActionCacheEntry } from '../cache/stores';
import { formatPageContext, getPageContext } from '../context/page-context';
import { actSystemPrompt, actUserPrompt, elementSystemPrompt, intentUserPrompt } from '../prompts';
import { type AiRuntime, newUsage, type Usage } from '../runtime';
import { StepExecutionError, executePlan } from './executor';
import { PageKnowledge } from './knowledge';
import { ActionPlanSchema, TargetSpecSchema, describeTarget, targetToLocator } from './plan';
import type { ActionStep } from './plan';

/** Per-action timeout while replaying plans — keeps stale-cache detection fast. */
const STEP_TIMEOUT_MS = 10_000;

/**
 * The `ai` fixture surface.
 *
 * @public
 */
export interface AiAgent {
  /**
   * Perform a natural-language goal. The first run compiles the goal into a deterministic
   * action plan (cached in `.testfly/action-cache.json`); later runs replay it with no LLM call.
   * Use `{{name}}` placeholders + `params` for values that must never reach the model (passwords).
   */
  act(goal: string, params?: Record<string, string>): Promise<void>;
  /** Resolve one element from a description and return a plain Playwright {@link Locator}. */
  byIntent(intent: string): Promise<Locator>;
  /** Convenience for `expect(page).toSatisfyAi(condition)`. */
  assert(condition: string): Promise<void>;
}

const ElementAnswerSchema = z.object({ target: TargetSpecSchema, confidence: z.number().min(0).max(1).optional(), reason: z.string().optional() });

/** @internal */
export interface AgentDeps {
  page: Page;
  runtime: AiRuntime;
  baseUrl?: string;
  /** Provided by the fixture: `expect(page).toSatisfyAi(...)`. */
  assertFn: (condition: string) => Promise<void>;
  /** Wrap a feature call in a report step (test.step). */
  step?: <T>(title: string, body: () => Promise<T>) => Promise<T>;
}

/** @internal */
export class TestFlyAgent implements AiAgent {
  private readonly knowledge: PageKnowledge;

  constructor(private readonly deps: AgentDeps) {
    this.knowledge = new PageKnowledge(deps.runtime.caches.knowledge);
  }

  async act(goal: string, params: Record<string, string> = {}): Promise<void> {
    const run = () => this.doAct(goal, params);
    return this.deps.step ? this.deps.step(`ai.act: ${goal}`, run) : run();
  }

  async byIntent(intent: string): Promise<Locator> {
    const run = () => this.doByIntent(intent);
    return this.deps.step ? this.deps.step(`ai.byIntent: ${intent}`, run) : run();
  }

  async assert(condition: string): Promise<void> {
    const run = () => this.deps.assertFn(condition);
    return this.deps.step ? this.deps.step(`ai.assert: ${condition}`, run) : run();
  }

  // ---------------------------------------------------------------- act

  private async doAct(goal: string, params: Record<string, string>): Promise<void> {
    const rt = this.deps.runtime;
    const { page } = this.deps;
    rt.assertEnabled('act');
    const startedAt = Date.now();
    const usage = newUsage();
    const startUrl = page.url();
    const pattern = urlPattern(startUrl);
    const key = actionKey(startUrl, goal);
    const exec = { params, baseUrl: this.deps.baseUrl, stepTimeoutMs: STEP_TIMEOUT_MS };
    let cache: AiEvent['cache'] = 'miss';
    let done: ActionStep[] = [];

    try {
      // 1) Action cache (Compile & Freeze)
      const cached = await rt.caches.actions.get(key);
      if (cached) {
        try {
          await executePlan(page, cached.plan, exec);
          cache = 'hit';
          return;
        } catch (err) {
          if (!(err instanceof StepExecutionError)) throw err;
          if (!rt.live) {
            throw rt.cacheMiss(`A working plan for "${goal}"`, 'The cached plan no longer matches the page. Re-record with ai.mode="live" and commit the updated cache.', err);
          }
          done = cached.plan.slice(0, err.index);
          await rt.caches.actions.delete(key); // stale: recompile below
        }
      }

      // 2) Auto-POM knowledge (zero tokens)
      if (!done.length) {
        const local = await this.knowledge.resolve(pattern, goal);
        if (local) {
          try {
            await executePlan(page, local, exec);
            cache = 'knowledge';
            await rt.caches.actions.set(key, entry(local, 'knowledge'));
            return;
          } catch (err) {
            if (!(err instanceof StepExecutionError)) throw err;
            if (!rt.live) throw rt.cacheMiss(`A working plan for "${goal}"`, 'The learned page knowledge no longer matches the page.', err);
            done = local.slice(0, err.index);
          }
        }
      }

      // 3) LLM compile (live only)
      if (!rt.live) throw rt.cacheMiss(`A plan for "${goal}" on ${pattern}`);
      cache = 'miss';
      const ctx = await getPageContext(page, rt.options.maxContextChars, secretValues(params));
      const compiled = await rt.completeJson({
        system: actSystemPrompt(),
        user: actUserPrompt({ goal, pageContext: formatPageContext(ctx), alreadyDone: done }),
        schema: ActionPlanSchema,
        usage,
      });
      try {
        await executePlan(page, compiled.steps, exec);
      } catch (err) {
        if (!(err instanceof StepExecutionError)) throw err;
        throw new TestFlyError('TF_AI_ACTION_FAILED', `act("${goal}") failed: ${err.message}`, {
          hint: 'The compiled plan could not be executed. Make the goal more specific or check the page state.',
          cause: err,
          details: { plan: compiled.steps.map((s) => s.description) },
        });
      }
      const full = [...done, ...compiled.steps];
      await rt.caches.actions.set(key, entry(full, 'llm', usage.model));
      await this.knowledge.learn(pattern, full);
    } finally {
      await rt.attach('act', goal, cache, startedAt, usage);
    }
  }

  // ----------------------------------------------------------- byIntent

  private async doByIntent(intent: string): Promise<Locator> {
    const rt = this.deps.runtime;
    const { page } = this.deps;
    rt.assertEnabled('byIntent');
    const startedAt = Date.now();
    const usage: Usage = newUsage();
    const pattern = urlPattern(page.url());
    const key = intentKey(page.url(), intent);
    let cache: AiEvent['cache'] = 'miss';

    const attached = async (target: ActionStep['target'] & object): Promise<Locator | null> => {
      const loc = targetToLocator(page, target);
      try {
        await loc.first().waitFor({ state: 'attached', timeout: STEP_TIMEOUT_MS });
        return loc;
      } catch {
        return null;
      }
    };

    try {
      const cached = await rt.caches.actions.get(key);
      const cachedTarget = cached?.plan[0]?.target;
      if (cachedTarget) {
        const loc = await attached(cachedTarget);
        if (loc) {
          cache = 'hit';
          return loc;
        }
        if (!rt.live) throw rt.cacheMiss(`A working locator for intent "${intent}"`, 'The cached target no longer matches the page.');
        await rt.caches.actions.delete(key);
      }

      const known = await this.knowledge.resolveElement(pattern, intent);
      if (known) {
        const loc = await attached(known.target);
        if (loc) {
          cache = 'knowledge';
          await rt.caches.actions.set(key, entry([{ action: 'waitVisible', target: known.target, description: intent }], 'knowledge'));
          return loc;
        }
      }

      if (!rt.live) throw rt.cacheMiss(`A locator for intent "${intent}" on ${pattern}`);
      const ctx = await getPageContext(page, rt.options.maxContextChars);
      const answer = await rt.completeJson({ system: elementSystemPrompt(), user: intentUserPrompt({ intent, pageContext: formatPageContext(ctx) }), schema: ElementAnswerSchema, usage });
      const loc = targetToLocator(page, answer.target);
      if ((await loc.count()) === 0) {
        throw new TestFlyError('TF_AI_ACTION_FAILED', `byIntent("${intent}"): the model suggested ${describeTarget(answer.target)} but nothing matches it.`, {
          hint: 'Describe the element more precisely.',
        });
      }
      await rt.caches.actions.set(key, entry([{ action: 'waitVisible', target: answer.target, description: intent }], 'llm', usage.model));
      return loc;
    } finally {
      await rt.attach('byIntent', intent, cache, startedAt, usage);
    }
  }
}

/** Param values may be secrets: they must not leak into the model prompt via the page context. */
function secretValues(params: Record<string, string>): string[] {
  return Object.values(params).filter((v) => v.length >= 4);
}

function entry(plan: ActionStep[], source: ActionCacheEntry['source'], model?: string): ActionCacheEntry {
  return { plan, source, ...(model ? { model } : {}), createdAt: new Date().toISOString().slice(0, 10) };
}
