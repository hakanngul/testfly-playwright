import type { Page } from '@playwright/test';
import { TestFlyError } from '@testfly/playwright';
import { type ActionStep, targetToLocator } from './plan';

/** Raised when step `index` of a plan could not be executed. @internal */
export class StepExecutionError extends Error {
  constructor(
    readonly index: number,
    readonly step: ActionStep,
    cause: unknown,
  ) {
    super(`Step ${index + 1} ("${step.description}") failed: ${cause instanceof Error ? cause.message.split('\n')[0] : String(cause)}`, { cause });
    this.name = 'StepExecutionError';
  }
}

/** @internal */
export interface ExecContext {
  params: Record<string, string>;
  baseUrl?: string;
  /** Per-action timeout; keeps "stale cache" detection fast. */
  stepTimeoutMs: number;
}

const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** Replace `{{name}}` placeholders with caller params. @internal */
export function substitute(value: string, params: Record<string, string>): string {
  return value.replace(PLACEHOLDER, (_m, name: string) => {
    const v = params[name];
    if (v === undefined) {
      throw new TestFlyError('TF_CONFIG_INVALID', `act() goal references {{${name}}} but no such param was passed.`, {
        hint: `ai.act(goal, { ${name}: '…' })`,
      });
    }
    return v;
  });
}

function resolveUrl(value: string, baseUrl?: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || !baseUrl) return value;
  return new URL(value, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function runStep(page: Page, step: ActionStep, ctx: ExecContext): Promise<void> {
  const timeout = ctx.stepTimeoutMs;
  const value = step.value !== undefined ? substitute(step.value, ctx.params) : undefined;
  if (step.action === 'navigate') {
    await page.goto(resolveUrl(value ?? '/', ctx.baseUrl), { timeout });
    return;
  }
  if (step.action === 'press' && !step.target) {
    await page.keyboard.press(value ?? 'Enter');
    return;
  }
  const loc = targetToLocator(page, step.target!);
  switch (step.action) {
    case 'click':
      return loc.click({ timeout });
    case 'fill':
      return loc.fill(value ?? '', { timeout });
    case 'clear':
      return loc.clear({ timeout });
    case 'hover':
      return loc.hover({ timeout });
    case 'press':
      return loc.press(value ?? 'Enter', { timeout });
    case 'select':
      await loc.selectOption(value ?? '', { timeout });
      return;
    case 'check':
      return loc.check({ timeout });
    case 'uncheck':
      return loc.uncheck({ timeout });
    case 'waitVisible':
      return loc.waitFor({ state: 'visible', timeout });
  }
}

/**
 * Execute plan steps in order using auto-waiting Playwright actions.
 * Throws {@link StepExecutionError} (with the failing index) on the first failure;
 * {@link TestFlyError}s (e.g. missing params) pass through unchanged.
 *
 * @internal
 */
export async function executePlan(page: Page, steps: ActionStep[], ctx: ExecContext): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    try {
      await runStep(page, steps[i], ctx);
    } catch (err) {
      if (err instanceof TestFlyError) throw err;
      throw new StepExecutionError(i, steps[i], err);
    }
  }
}
