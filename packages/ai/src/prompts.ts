/**
 * Prompt templates. Kept as plain, readable functions so they can be reviewed and tuned.
 * Every prompt asks for JSON only; user content never carries secrets (see redaction).
 */
import type { ActionStep } from './agent/plan';

const TARGET_SPEC_DOC = `A "target" is ONE of these JSON shapes (prefer them in this order):
  { "role": "<ARIA role>", "name": "<accessible name>" }   // best: buttons, links, textboxes, checkboxes...
  { "label": "<form label text>" }
  { "text": "<visible text>" }
  { "testid": "<data-testid>" }
  { "placeholder": "<placeholder text>" }
  { "css": "<selector>" }                                  // LAST RESORT only if nothing semantic exists`;

/** System prompt for compiling a natural-language goal into a deterministic plan. */
export function actSystemPrompt(): string {
  return `You are the planner of a Playwright test runner. Convert a natural-language goal into a short, deterministic list of browser actions for the page described by its ARIA snapshot.

Return ONLY JSON: { "steps": [ { "action": string, "target"?: target, "value"?: string, "description": string } ] }

Allowed actions: click, fill, clear, hover, press, select, check, uncheck, navigate, waitVisible.
- fill/select/press/navigate require "value". "press" without a target presses a keyboard key (e.g. "Enter"). "navigate" takes a path or URL.
- ${TARGET_SPEC_DOC}
- Use accessible names and roles exactly as they appear in the snapshot. Never invent elements that are not in the snapshot.
- Placeholders like {{name}} in the goal are secrets/parameters: copy them VERBATIM into "value", never guess their content.
- If a menu item is only visible after hovering/clicking a parent, add that step first.
- Use the fewest steps needed. "description" is a short human sentence (e.g. "Click the Login button").
- "steps" must never be empty; if the goal is ambiguous pick the closest sensible action.`;
}

/** User prompt for act(); `alreadyDone` is set when a previous plan failed half-way. */
export function actUserPrompt(args: { goal: string; pageContext: string; alreadyDone?: ActionStep[] }): string {
  const done = args.alreadyDone?.length
    ? `\nThese steps were ALREADY executed successfully (do not repeat them); return only the REMAINING steps:\n${args.alreadyDone.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}\n`
    : '';
  return `Goal: ${args.goal}\n${done}\nCurrent page:\n${args.pageContext}`;
}

/** System prompt for resolving one element (byIntent / healing). */
export function elementSystemPrompt(): string {
  return `You locate ONE element on a web page for a Playwright test. You get an intent and the page's ARIA snapshot.

Return ONLY JSON: { "target": target, "confidence": number between 0 and 1, "reason": string }
- ${TARGET_SPEC_DOC}
- The target must match exactly one element. Use the accessible name exactly as in the snapshot.
- Never invent elements that are not in the snapshot.`;
}

/** User prompt for byIntent(). */
export function intentUserPrompt(args: { intent: string; pageContext: string }): string {
  return `Intent: ${args.intent}\n\nCurrent page:\n${args.pageContext}`;
}

/** User prompt for AI healing of a broken locator. */
export function healUserPrompt(args: { key: string; original: string; intent: string; definition?: unknown; pageContext: string }): string {
  const def = args.definition !== undefined ? `\nOriginal definition: ${JSON.stringify(args.definition)}` : '';
  return `A locator stopped matching and must be healed.
Locator key: ${args.key}
Original locator: ${args.original}${def}
What the element is for: ${args.intent}

Find the element that serves the same purpose on the current page.

Current page:
${args.pageContext}`;
}

/** System prompt for semantic assertions. */
export function assertSystemPrompt(mode: 'satisfy' | 'violate'): string {
  const rule =
    mode === 'satisfy'
      ? 'Set "pass" to true only if the condition is clearly TRUE for the given content.'
      : 'Set "pass" to true only if the content clearly VIOLATES (contradicts / fails) the condition.';
  return `You are a strict QA assertion judge. You receive a condition and the ARIA snapshot of a page or element.
${rule}
Judge ONLY from the provided content; if it does not contain enough information, set "pass" to false and say what is missing.
Return ONLY JSON: { "pass": boolean, "reason": string } with a one or two sentence reason.`;
}

/** User prompt for semantic assertions. */
export function assertUserPrompt(args: { condition: string; pageContext: string }): string {
  return `Condition: ${args.condition}\n\nContent:\n${args.pageContext}`;
}

/** System prompt for failure analysis (free-form markdown answer). */
export function analysisSystemPrompt(): string {
  return `You are a senior test automation engineer analysing a failed Playwright test. Using the error, the code snippet, the last test steps and the page URL, explain in Markdown:
1. **Likely root cause** (one short paragraph)
2. **Category**: one of APPLICATION_BUG, TEST_BUG, SYSTEM_FLAKY, NEEDS_INVESTIGATION
3. **Suggested fix** (concrete, 1-4 bullets)
Be concise (under 200 words). Do not invent facts that are not in the data; say what is unknown.`;
}

/** User prompt for failure analysis. */
export function analysisUserPrompt(args: { title: string; error: string; snippet?: string; steps: string[]; url?: string }): string {
  return `Test: ${args.title}
${args.url ? `Page URL: ${args.url}\n` : ''}
Error:
${args.error}
${args.snippet ? `\nCode snippet:\n${args.snippet}\n` : ''}
Last steps:
${args.steps.length ? args.steps.map((s) => `- ${s}`).join('\n') : '(none recorded)'}`;
}
