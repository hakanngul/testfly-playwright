import { z } from 'zod';
import type { Locator, Page } from '@playwright/test';

/**
 * Semantic element reference. Executed through `getByRole/getByLabel/getByText/getByTestId/
 * getByPlaceholder` (CSS is a last resort).
 *
 * @public
 */
export const TargetSpecSchema = z.union([
  z.object({ role: z.string().min(1), name: z.string().optional(), exact: z.boolean().optional() }),
  z.object({ label: z.string().min(1) }),
  z.object({ text: z.string().min(1) }),
  z.object({ testid: z.string().min(1) }),
  z.object({ placeholder: z.string().min(1) }),
  z.object({ css: z.string().min(1) }),
]);
/** @public */
export type TargetSpec = z.infer<typeof TargetSpecSchema>;

/** @public */
export const ACTIONS = ['click', 'fill', 'clear', 'hover', 'press', 'select', 'check', 'uncheck', 'navigate', 'waitVisible'] as const;
/** @public */
export type ActionName = (typeof ACTIONS)[number];

/** One deterministic step of a compiled plan. @public */
export const ActionStepSchema = z
  .object({
    action: z.enum(ACTIONS),
    target: TargetSpecSchema.optional(),
    value: z.string().optional(),
    description: z.string(),
  })
  .superRefine((step, ctx) => {
    const needsTarget = step.action !== 'navigate' && step.action !== 'press';
    if (needsTarget && !step.target) ctx.addIssue({ code: 'custom', message: `"${step.action}" requires a target`, path: ['target'] });
    if (['fill', 'select', 'navigate', 'press'].includes(step.action) && step.value === undefined) {
      ctx.addIssue({ code: 'custom', message: `"${step.action}" requires a value`, path: ['value'] });
    }
  });
/** @public */
export type ActionStep = z.infer<typeof ActionStepSchema>;

/** @public */
export const ActionPlanSchema = z.object({ steps: z.array(ActionStepSchema).min(1).max(30) });
/** @public */
export type ActionPlan = z.infer<typeof ActionPlanSchema>;

/** Human readable Playwright-ish description of a target (logs, heal events). @public */
export function describeTarget(t: TargetSpec): string {
  if ('role' in t) return `getByRole(${JSON.stringify(t.role)}${t.name !== undefined ? `, { name: ${JSON.stringify(t.name)}${t.exact ? ', exact: true' : ''} }` : ''})`;
  if ('label' in t) return `getByLabel(${JSON.stringify(t.label)})`;
  if ('text' in t) return `getByText(${JSON.stringify(t.text)})`;
  if ('testid' in t) return `getByTestId(${JSON.stringify(t.testid)})`;
  if ('placeholder' in t) return `getByPlaceholder(${JSON.stringify(t.placeholder)})`;
  return `locator(${JSON.stringify(t.css)})`;
}

/** Turn a target spec into a Playwright locator. @public */
export function targetToLocator(page: Page, t: TargetSpec): Locator {
  if ('role' in t) {
    // The model supplies a free-form role string; Playwright validates it at runtime.
    const role = t.role as Parameters<Page['getByRole']>[0];
    return page.getByRole(role, t.name !== undefined ? { name: t.name, exact: t.exact } : {});
  }
  if ('label' in t) return page.getByLabel(t.label);
  if ('text' in t) return page.getByText(t.text);
  if ('testid' in t) return page.getByTestId(t.testid);
  if ('placeholder' in t) return page.getByPlaceholder(t.placeholder);
  return page.locator(t.css);
}

/** Short human label for a target (used for synonyms). @internal */
export function targetLabel(t: TargetSpec): string {
  if ('role' in t) return t.name ?? t.role;
  if ('label' in t) return t.label;
  if ('text' in t) return t.text;
  if ('testid' in t) return t.testid;
  if ('placeholder' in t) return t.placeholder;
  return t.css;
}
