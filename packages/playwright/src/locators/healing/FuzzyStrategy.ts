import type { Locator, Page } from '@playwright/test';
import type { LocatorDef } from '../types';
import { similarity } from './similarity';
import type { HealContext, HealingStrategy, HealResult } from './types';

/** Features of one DOM element collected in the browser. @internal */
export interface ElementFeatures {
  tag: string;
  role: string;
  id: string;
  name: string;
  classes: string[];
  text: string;
  aria: string;
  placeholder: string;
  testid: string;
  testidAttr: string;
  title: string;
  alt: string;
  label: string;
  uniqueId: boolean;
  cssPath: string;
}

/**
 * Browser side collector. Kept as a plain JS string so that no transpiler helper
 * (e.g. esbuild `__name`) is ever injected into the page; it is fully self-contained.
 */
const COLLECT_SCRIPT = `(() => {
  const MAX = 500;
  const SEL = 'a[href],button,input,select,textarea,summary,[role],[contenteditable="true"],[tabindex],[data-testid],[data-test],[data-test-id],[data-qa],[data-cy],[aria-label],[title],label,h1,h2,h3,h4,h5,h6,img[alt]';
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, 160);
  const esc = (s) => String(s).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
  const implicitRole = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit.split(' ')[0];
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'img') return 'img';
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button';
      if (t === 'range') return 'slider';
      if (t === 'number') return 'spinbutton';
      if (t === 'search') return 'searchbox';
      return 'textbox';
    }
    return '';
  };
  const cssPath = (el) => {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      const tag = cur.tagName.toLowerCase();
      if (cur.id && document.querySelectorAll('[id="' + esc(cur.id) + '"]').length === 1) {
        parts.unshift(tag + '[id="' + esc(cur.id) + '"]');
        break;
      }
      let idx = 1;
      let sib = cur.previousElementSibling;
      while (sib) { if (sib.tagName === cur.tagName) idx++; sib = sib.previousElementSibling; }
      parts.unshift(tag + ':nth-of-type(' + idx + ')');
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };
  const out = [];
  const nodes = document.querySelectorAll(SEL);
  for (let i = 0; i < nodes.length && out.length < MAX; i++) {
    const el = nodes[i];
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width <= 0 || r.height <= 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && (el.getAttribute('type') || '').toLowerCase() === 'hidden') continue;
    let testidAttr = '';
    let testid = '';
    const attrs = ['data-testid', 'data-test', 'data-test-id', 'data-qa', 'data-cy'];
    for (let a = 0; a < attrs.length; a++) {
      const v = el.getAttribute(attrs[a]);
      if (v) { testidAttr = attrs[a]; testid = v; break; }
    }
    let label = '';
    if (el.labels && el.labels.length) label = norm(Array.prototype.map.call(el.labels, (l) => l.textContent).join(' '));
    let text = norm(el.innerText || el.textContent);
    if (tag === 'input') text = norm(el.value && /^(submit|button|reset)$/i.test(el.type) ? el.value : '');
    out.push({
      tag,
      role: implicitRole(el),
      id: el.id || '',
      name: el.getAttribute('name') || '',
      classes: Array.prototype.slice.call(el.classList, 0, 8),
      text,
      aria: norm(el.getAttribute('aria-label')),
      placeholder: norm(el.getAttribute('placeholder')),
      testid,
      testidAttr,
      title: norm(el.getAttribute('title')),
      alt: norm(el.getAttribute('alt')),
      label,
      uniqueId: !!el.id && document.querySelectorAll('[id="' + esc(el.id) + '"]').length === 1,
      cssPath: cssPath(el),
    });
  }
  return out;
})()`;

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Intent phrases (with weights) used to score elements. @internal */
export function intentPhrases(def: LocatorDef | undefined, key: string): Array<{ phrase: string; weight: number }> {
  const out: Array<{ phrase: string; weight: number }> = [];
  if (def) {
    for (const v of [def.name, def.label, def.text, def.placeholder, def.alt, def.title, def.testid]) {
      if (v) out.push({ phrase: v, weight: 1 });
    }
    if (def.css) {
      for (const m of def.css.matchAll(/[#.]([\w-]+)|\[[\w-]+[*^$~|]?=["']?([^"'\]]+)/g)) {
        const t = m[1] ?? m[2];
        if (t) out.push({ phrase: t, weight: 0.85 });
      }
    }
  }
  const last = key.split('.').pop() ?? key;
  if (last) out.push({ phrase: last, weight: 0.9 });
  return out;
}

/** Score one element against the intent, 0..1. @internal */
export function scoreElement(el: ElementFeatures, phrases: Array<{ phrase: string; weight: number }>, wantedRole: string | undefined): number {
  const fields: Array<{ v: string; w: number }> = [
    { v: el.text, w: 1 },
    { v: el.aria, w: 1 },
    { v: el.label, w: 1 },
    { v: el.placeholder, w: 1 },
    { v: el.title, w: 0.95 },
    { v: el.alt, w: 0.95 },
    { v: el.testid, w: 0.95 },
    { v: el.id, w: 0.95 },
    { v: el.name, w: 0.9 },
    ...el.classes.map((c) => ({ v: c, w: 0.8 })),
  ];
  let best = 0;
  for (const { phrase, weight } of phrases) {
    for (const f of fields) {
      if (!f.v) continue;
      const s = similarity(phrase, f.v) * weight * f.w;
      if (s > best) best = s;
    }
  }
  if (wantedRole) {
    if (!el.role) best *= 0.9;
    else if (el.role !== wantedRole) best *= 0.85;
  }
  return Math.min(1, best);
}

async function uniqueLocator(page: Page, el: ElementFeatures): Promise<{ locator: Locator; description: string } | null> {
  const attempts: Array<{ locator: Locator; description: string }> = [];
  if (el.testid) {
    attempts.push(
      el.testidAttr === 'data-testid'
        ? { locator: page.getByTestId(el.testid), description: `getByTestId(${q(el.testid)})` }
        : { locator: page.locator(`[${el.testidAttr}="${el.testid}"]`), description: `locator(${q(`[${el.testidAttr}="${el.testid}"]`)})` },
    );
  }
  if (el.uniqueId) attempts.push({ locator: page.locator(`[id="${el.id}"]`), description: `locator(${q(`[id="${el.id}"]`)})` });
  const name = el.aria || el.label || el.text;
  if (el.role && name) {
    attempts.push({
      locator: page.getByRole(el.role as Parameters<Page['getByRole']>[0], { name, exact: true }),
      description: `getByRole(${q(el.role)}, { name: ${q(name)}, exact: true })`,
    });
  }
  attempts.push({ locator: page.locator(el.cssPath), description: `locator(${q(el.cssPath)})` });
  for (const a of attempts) {
    if ((await a.locator.count().catch(() => 0)) === 1) return a;
  }
  return null;
}

/**
 * Fuzzy DOM healing (priority 20): scores visible interactive elements against the intent of the
 * failed locator (normalized Levenshtein + token Jaccard) and builds a stable selector for the winner.
 * @public
 */
export class FuzzyStrategy implements HealingStrategy {
  readonly name = 'fuzzy';
  readonly priority = 20;

  constructor(private readonly threshold: number = 0.75) {}

  async heal(ctx: HealContext): Promise<HealResult | null> {
    const def = ctx.definition as LocatorDef | undefined;
    const phrases = intentPhrases(def && typeof def === 'object' ? def : undefined, ctx.key);
    if (!phrases.length) return null;

    const elements = (await ctx.page.evaluate(COLLECT_SCRIPT)) as ElementFeatures[];
    const scored = elements
      .map((el) => ({ el, score: scoreElement(el, phrases, def?.role) }))
      .filter((s) => s.score >= this.threshold)
      .sort((a, b) => b.score - a.score);

    for (const { el, score } of scored.slice(0, 5)) {
      const found = await uniqueLocator(ctx.page, el);
      if (found) return { locator: found.locator, description: found.description, confidence: Number(score.toFixed(3)) };
    }
    return null;
  }
}

