import { test as base, expect as baseExpect } from '@testfly/playwright';
import type { TestFlyOptions } from '@testfly/playwright';
import { test as pwTest } from '@playwright/test';
import { TestFlyAgent } from './agent/agent';
import type { AiAgent } from './agent/agent';
import { aiMatchers, registerRuntime } from './assertions/matchers';
import { AiRuntime } from './runtime';

/**
 * `expect` with the semantic matchers `toSatisfyAi` / `toViolateAi` (works with `expect.soft`).
 *
 * @public
 */
export const expect = baseExpect.extend(aiMatchers);

/**
 * TestFly `test` plus the `ai` fixture (`act`, `byIntent`, `assert`).
 * Reads its options from the worker-scoped `testfly` option fixture (`testfly.ai`).
 *
 * @public
 */
export const aiTest = base.extend<{ ai: AiAgent; _aiRuntime: AiRuntime }>({
  // Auto fixture: makes the per-test runtime reachable from `expect.extend` matchers.
  _aiRuntime: [
    async ({ testfly }: { testfly: TestFlyOptions }, use, testInfo) => {
      const runtime = new AiRuntime(testfly.ai, testInfo.config.rootDir, testInfo);
      registerRuntime(testInfo, runtime);
      await use(runtime);
    },
    { auto: true },
  ],
  ai: async ({ page, testfly, baseURL, _aiRuntime }, use) => {
    const agent = new TestFlyAgent({
      page,
      runtime: _aiRuntime,
      baseUrl: testfly.baseUrl ?? baseURL,
      assertFn: (condition) => expect(page).toSatisfyAi(condition),
      step: (title, body) => pwTest.step(title, body),
    });
    await use(agent);
  },
});

/** Alias of {@link aiTest} so `import { test, expect } from '@testfly/ai'` just works. @public */
export const test = aiTest;

export type { AiAgent } from './agent/agent';
export { createAiHealingStrategy } from './healing';
export { createProvider, registerProvider, DEFAULT_MODELS } from './providers';
export type { LlmProvider, LlmRequest, LlmResponse, LlmMessage, ProviderFactory } from './providers';
export { redact } from './context/redact';
export type { RedactOptions } from './context/redact';
export { resolveAiOptions } from './options';
export { aiMatchers } from './assertions/matchers';
export { TargetSpecSchema, ActionStepSchema, ActionPlanSchema, describeTarget, targetToLocator } from './agent/plan';
export type { TargetSpec, ActionStep, ActionPlan, ActionName } from './agent/plan';
export type { ActionCacheEntry, KnownElement, PageKnowledgeEntry, HealedEntry } from './cache/stores';
export type { TestFlyOptions, AiOptions, HealingStrategy, HealContext, HealResult } from '@testfly/playwright';
