import type { JsonFileCache } from '../cache/json-file-cache';
import type { KnownElement, PageKnowledgeEntry } from '../cache/stores';
import type { ActionName, ActionStep, TargetSpec } from './plan';
import { describeTarget, targetLabel } from './plan';

const STOPWORDS = new Set(['the', 'a', 'an', 'on', 'in', 'into', 'to', 'of', 'for', 'with', 'at', 'as', 'button', 'field', 'link', 'box', 'textbox', 'and', 'then', 'please', 'icon', 'menu']);

const VERBS: [RegExp, ActionName][] = [
  [/\b(uncheck|untick|deselect)\b/, 'uncheck'],
  [/\b(check|tick)\b/, 'check'],
  [/\b(clear|empty)\b/, 'clear'],
  [/\b(hover|mouse over)\b/, 'hover'],
  [/\b(type|enter|fill|input|write|set)\b/, 'fill'],
  [/\b(select|choose|pick)\b/, 'select'],
  [/\b(click|press|tap|open|submit|push|go to|follow)\b/, 'click'],
];
const VERB_WORDS = new Set(['uncheck', 'untick', 'deselect', 'check', 'tick', 'clear', 'empty', 'hover', 'mouse', 'over', 'type', 'enter', 'fill', 'input', 'write', 'set', 'select', 'choose', 'pick', 'click', 'press', 'tap', 'open', 'submit', 'push', 'go', 'follow']);
const VALUE_RE = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\{\{\s*[\w.-]+\s*\}\})/;

/** Lower-case content words of a phrase. @internal */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOPWORDS.has(t));
}

/** Detect action type + optional value from a single-clause goal. @internal */
function parseGoal(goal: string): { action: ActionName; value?: string; contentTokens: string[] } | null {
  const lower = goal.toLowerCase();
  // Multi-step goals are the LLM's job; the local resolver only handles one clause.
  const bare = lower.replace(new RegExp(VALUE_RE.source, 'g'), ' ');
  if (/\b(and|then|after|before)\b|[,;]/.test(bare)) return null;

  let action: ActionName = 'click';
  for (const [re, a] of VERBS) {
    if (re.test(lower)) {
      action = a;
      break;
    }
  }
  let value: string | undefined;
  let text = goal;
  if (action === 'fill' || action === 'select') {
    const m = VALUE_RE.exec(goal);
    if (!m) return null; // no value to type → cannot resolve locally
    value = m[1] ?? m[2] ?? m[3] ?? m[4];
    text = goal.replace(m[0], ' ');
  }
  const contentTokens = tokens(text).filter((t) => !VERB_WORDS.has(t));
  return contentTokens.length ? { action, value, contentTokens } : null;
}

/**
 * Auto-POM: page knowledge learned from successful LLM plans. Resolves simple single-clause
 * goals locally (zero tokens) by matching goal words against learned element synonyms.
 *
 * @internal
 */
export class PageKnowledge {
  constructor(private readonly store: JsonFileCache<PageKnowledgeEntry>) {}

  /** Build a plan for `goal` on `pattern` from learned elements, or null when unsure. */
  async resolve(pattern: string, goal: string): Promise<ActionStep[] | null> {
    const parsed = parseGoal(goal);
    if (!parsed) return null;
    const page = await this.store.get(pattern);
    if (!page) return null;
    const matches = page.elements
      .filter((el) => el.actionType === parsed.action)
      .filter((el) => {
        const syn = new Set(el.synonyms);
        return parsed.contentTokens.every((t) => syn.has(t));
      })
      // fewest synonyms = most specific element for these words
      .sort((a, b) => a.synonyms.length - b.synonyms.length);
    if (!matches.length) return null;
    if (matches.length > 1 && matches[0].synonyms.length === matches[1].synonyms.length) return null; // ambiguous → ask the LLM
    return this.toSteps(matches[0], parsed.action, parsed.value);
  }

  /** Resolve a single element by intent (no action) from learned elements. */
  async resolveElement(pattern: string, intent: string): Promise<KnownElement | null> {
    const page = await this.store.get(pattern);
    const want = tokens(intent).filter((t) => !VERB_WORDS.has(t));
    if (!page || !want.length) return null;
    const matches = page.elements
      .filter((el) => want.every((t) => el.synonyms.includes(t)))
      .sort((a, b) => a.synonyms.length - b.synonyms.length);
    if (!matches.length) return null;
    if (matches.length > 1 && matches[0].synonyms.length === matches[1].synonyms.length) return null;
    return matches[0];
  }

  private toSteps(el: KnownElement, action: ActionName, value?: string): ActionStep[] {
    const steps: ActionStep[] = [];
    if (el.parentTrigger) {
      steps.push({ action: el.parentTrigger.action, target: el.parentTrigger.target, description: `${el.parentTrigger.action === 'hover' ? 'Hover' : 'Click'} ${describeTarget(el.parentTrigger.target)} to reveal ${el.name}` });
    }
    steps.push({ action, target: el.target, ...(value !== undefined ? { value } : {}), description: `${action} ${el.name}` });
    return steps;
  }

  /** Learn elements (and hover/click parent triggers) from a successfully executed plan. */
  async learn(pattern: string, plan: ActionStep[]): Promise<void> {
    const learnable: ActionName[] = ['click', 'fill', 'clear', 'hover', 'select', 'check', 'uncheck'];
    const found: KnownElement[] = [];
    plan.forEach((step, i) => {
      if (!step.target || !learnable.includes(step.action)) return;
      const prev = plan[i - 1];
      const parent =
        prev?.target && (prev.action === 'hover' || prev.action === 'click') && step.action !== 'hover' && JSON.stringify(prev.target) !== JSON.stringify(step.target)
          ? { target: prev.target as TargetSpec, action: prev.action as 'hover' | 'click' }
          : undefined;
      // A trigger is only a parent when it was a hover (clicking a button then another button is just a sequence).
      const trigger = parent?.action === 'hover' ? parent : undefined;
      const name = targetLabel(step.target);
      const synonyms = [...new Set([...tokens(step.description), ...tokens(name)])].filter((t) => !VERB_WORDS.has(t)).sort();
      found.push({ name, target: step.target, actionType: step.action, synonyms, ...(trigger ? { parentTrigger: trigger } : {}) });
    });
    if (!found.length) return;
    await this.store.update(pattern, (cur) => {
      const elements = [...(cur?.elements ?? [])];
      for (const el of found) {
        const idx = elements.findIndex((e) => e.actionType === el.actionType && JSON.stringify(e.target) === JSON.stringify(el.target));
        if (idx === -1) elements.push(el);
        else {
          const old = elements[idx];
          elements[idx] = { ...old, synonyms: [...new Set([...old.synonyms, ...el.synonyms])].sort(), parentTrigger: el.parentTrigger ?? old.parentTrigger };
        }
      }
      elements.sort((a, b) => JSON.stringify([a.name, a.actionType]).localeCompare(JSON.stringify([b.name, b.actionType])));
      return { elements };
    });
  }
}
