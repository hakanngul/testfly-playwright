import type { Locator, Page } from '@playwright/test';
import type { LocatorDef } from '../types';
import type { HealContext, HealingStrategy, HealResult } from './types';

interface Candidate {
  description: string;
  build: (page: Page) => Locator;
}

const attr = (name: string, value: string): string => `[${name}="${value.replace(/"/g, '\\"')}"]`;
const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const css = (selector: string): Candidate => ({ description: `locator(${q(selector)})`, build: (p) => p.locator(selector) });

function testIdAttrs(value: string): Candidate[] {
  return ['data-test', 'data-test-id', 'data-qa', 'data-cy', 'data-testid'].map((a) => css(attr(a, value)));
}

function fromCss(selector: string): Candidate[] {
  const out: Candidate[] = [];
  const id = /(?:^|[\s>+~]|[a-z0-9]+)#([\w-]+)\s*$/i.exec(selector.trim())?.[1];
  if (id) {
    out.push({ description: `getByTestId(${q(id)})`, build: (p) => p.getByTestId(id) });
    out.push(css(attr('name', id)), ...testIdAttrs(id));
    out.push(css(attr('id', id.replace(/[-_]/g, ''))));
  }
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  if (classes.length) {
    const last = classes[classes.length - 1];
    if (classes.length > 1) out.push(css(`.${last}`));
    out.push(css(`[class*="${last}"]`));
  }
  const nameAttr = /\[name=["']?([^"'\]]+)["']?\]/.exec(selector)?.[1];
  if (nameAttr) out.push(css(attr('id', nameAttr)), ...testIdAttrs(nameAttr));
  return out;
}

function candidatesFor(def: LocatorDef): Candidate[] {
  const out: Candidate[] = [];
  if (def.role !== undefined) {
    const { role, name } = def;
    if (name) {
      out.push({ description: `getByText(${q(name)})`, build: (p) => p.getByText(name) });
      out.push({ description: `getByLabel(${q(name)})`, build: (p) => p.getByLabel(name) });
      out.push({ description: `getByRole(${q(role)}, { name: ${q(name)} })`, build: (p) => p.getByRole(role as Parameters<Page['getByRole']>[0], { name, exact: false }) });
      out.push({ description: `getByPlaceholder(${q(name)})`, build: (p) => p.getByPlaceholder(name) });
      out.push({ description: `getByTitle(${q(name)})`, build: (p) => p.getByTitle(name) });
      const first = name.split(/\s+/).find((t) => t.length > 2);
      if (first && first !== name) {
        out.push({ description: `getByRole(${q(role)}, { name: ${q(first)} })`, build: (p) => p.getByRole(role as Parameters<Page['getByRole']>[0], { name: first, exact: false }) });
      }
    }
  }
  if (def.label !== undefined) {
    const v = def.label;
    out.push({ description: `getByPlaceholder(${q(v)})`, build: (p) => p.getByPlaceholder(v) });
    out.push(css(attr('aria-label', v)));
    out.push({ description: `getByLabel(${q(v)})`, build: (p) => p.getByLabel(v, { exact: false }) });
    out.push({ description: `getByRole('textbox', { name: ${q(v)} })`, build: (p) => p.getByRole('textbox', { name: v }) });
    out.push({ description: `getByText(${q(v)})`, build: (p) => p.getByText(v) });
  }
  if (def.testid !== undefined) out.push(...testIdAttrs(def.testid), css(`#${def.testid.replace(/[^\w-]/g, '')}`), css(attr('name', def.testid)));
  if (def.text !== undefined) {
    const v = def.text;
    for (const role of ['button', 'link'] as const) {
      out.push({ description: `getByRole(${q(role)}, { name: ${q(v)} })`, build: (p) => p.getByRole(role, { name: v, exact: false }) });
    }
    out.push({ description: `getByText(${q(v)})`, build: (p) => p.getByText(v, { exact: false }) });
    out.push({ description: `getByLabel(${q(v)})`, build: (p) => p.getByLabel(v) });
  }
  if (def.placeholder !== undefined) {
    const v = def.placeholder;
    out.push({ description: `getByLabel(${q(v)})`, build: (p) => p.getByLabel(v) });
    out.push(css(attr('aria-label', v)));
    out.push({ description: `getByPlaceholder(${q(v)})`, build: (p) => p.getByPlaceholder(v, { exact: false }) });
  }
  if (def.alt !== undefined) {
    const v = def.alt;
    out.push({ description: `getByTitle(${q(v)})`, build: (p) => p.getByTitle(v) }, css(attr('aria-label', v)), { description: `getByAltText(${q(v)})`, build: (p) => p.getByAltText(v, { exact: false }) });
  }
  if (def.title !== undefined) {
    const v = def.title;
    out.push(css(attr('aria-label', v)), { description: `getByText(${q(v)})`, build: (p) => p.getByText(v) }, { description: `getByTitle(${q(v)})`, build: (p) => p.getByTitle(v, { exact: false }) });
  }
  if (def.css !== undefined) out.push(...fromCss(def.css));
  return out;
}

/**
 * Rule based healing (priority 10): derives alternative locators from the failed definition
 * (ids, classes, accessible names, test-id attributes…) and accepts the first unique match.
 * @public
 */
export class RulesStrategy implements HealingStrategy {
  readonly name = 'rules';
  readonly priority = 10;

  async heal(ctx: HealContext): Promise<HealResult | null> {
    const def = ctx.definition as LocatorDef | undefined;
    if (!def || typeof def !== 'object') return null;
    const seen = new Set<string>([ctx.original]);
    const candidates = candidatesFor(def).filter((c) => !seen.has(c.description) && seen.add(c.description));

    let index = 0;
    for (const c of candidates) {
      const position = index++;
      const loc = c.build(ctx.page);
      let count: number;
      try {
        count = await loc.count();
      } catch {
        continue;
      }
      if (count === 0) continue;
      const base = Math.max(0.6, 0.85 - position * 0.03);
      if (count === 1) return { locator: loc, description: c.description, confidence: base };
      for (let i = 0; i < Math.min(count, 5); i++) {
        if (await loc.nth(i).isVisible().catch(() => false)) {
          return { locator: loc.nth(i), description: `${c.description}.nth(${i})`, confidence: Math.min(base, 0.5) };
        }
      }
    }
    return null;
  }
}
