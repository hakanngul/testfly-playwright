import type { ExpectMatcherState, Locator, Page, TestInfo } from '@playwright/test';
import { TestFlyError } from '@testfly/playwright';
import { z } from 'zod';
import { formatPageContext, getPageContext } from '../context/page-context';
import { assertSystemPrompt, assertUserPrompt } from '../prompts';
import { type AiRuntime, currentTestInfo, newUsage } from '../runtime';

/**
 * Per-test runtime registry, filled by the `_aiRuntime` auto fixture. Keyed by TestInfo so
 * there is no global configuration singleton (ADR-001 D2).
 *
 * @internal
 */
const runtimes = new WeakMap<TestInfo, AiRuntime>();

/** @internal */
export function registerRuntime(info: TestInfo, runtime: AiRuntime): void {
  runtimes.set(info, runtime);
}

const VerdictSchema = z.object({ pass: z.boolean(), reason: z.string() });

function isLocator(v: unknown): v is Locator {
  return !!v && typeof (v as Locator).page === 'function' && typeof (v as Locator).ariaSnapshot === 'function';
}

async function judge(mode: 'satisfy' | 'violate', received: Page | Locator, condition: string): Promise<{ pass: boolean; reason: string }> {
  const info = currentTestInfo();
  const runtime = info ? runtimes.get(info) : undefined;
  if (!runtime) {
    throw new TestFlyError('TF_AI_NOT_CONFIGURED', 'toSatisfyAi/toViolateAi need the TestFly AI fixtures.', {
      hint: "Import { test, expect } from '@testfly/ai' (not from '@playwright/test') in this test file.",
    });
  }
  runtime.assertEnabled('assert');
  if (!runtime.live) {
    // Assertions are never cached: replay must not silently pass or skip.
    throw new TestFlyError('TF_FEATURE_DISABLED', 'AI assertions are not available in ai.mode="replay".', {
      hint: 'AI assertions need ai.mode=live (they are evaluated on every run). Use deterministic matchers on CI.',
    });
  }
  const startedAt = Date.now();
  const usage = newUsage();
  try {
    const ctx = await getPageContext(received, runtime.options.maxContextChars);
    return await runtime.completeJson({
      system: assertSystemPrompt(mode),
      user: assertUserPrompt({ condition, pageContext: formatPageContext(ctx) }),
      schema: VerdictSchema,
      usage,
    });
  } finally {
    await runtime.attach('assert', `${mode}: ${condition}`, 'miss', startedAt, usage);
  }
}

function build(mode: 'satisfy' | 'violate', name: string) {
  return async function (this: ExpectMatcherState, received: Page | Locator, condition: string) {
    const { pass, reason } = await judge(mode, received, condition);
    const scope = isLocator(received) ? 'locator' : 'page';
    return {
      name,
      pass,
      expected: condition,
      message: () =>
        this.isNot
          ? `Expected ${scope} not to ${mode === 'satisfy' ? 'satisfy' : 'violate'}: "${condition}"\nAI verdict: ${reason}`
          : `Expected ${scope} to ${mode === 'satisfy' ? 'satisfy' : 'violate'}: "${condition}"\nAI verdict: ${reason}`,
    };
  };
}

/**
 * Semantic assertion matchers (single evaluation, no polling).
 *
 * - `await expect(page).toSatisfyAi('the cart shows 2 items')`
 * - `await expect(locator).toViolateAi('the form displays a validation error')`
 *
 * @public
 */
export const aiMatchers = {
  toSatisfyAi: build('satisfy', 'toSatisfyAi'),
  toViolateAi: build('violate', 'toViolateAi'),
};
