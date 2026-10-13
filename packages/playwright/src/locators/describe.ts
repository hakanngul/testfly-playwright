import type { LocatorDef } from './types';
import { SELECTOR_FIELDS } from './types';

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function opts(def: LocatorDef, withName: boolean): string {
  const parts: string[] = [];
  if (withName && def.name !== undefined) parts.push(`name: ${q(def.name)}`);
  if (def.level !== undefined) parts.push(`level: ${def.level}`);
  if (def.exact) parts.push('exact: true');
  return parts.length ? `, { ${parts.join(', ')} }` : '';
}

function describeOne(def: LocatorDef): string {
  const f = SELECTOR_FIELDS.find((k) => def[k] !== undefined);
  let s: string;
  switch (f) {
    case 'role': s = `getByRole(${q(def.role!)}${opts(def, true)})`; break;
    case 'label': s = `getByLabel(${q(def.label!)}${opts(def, false)})`; break;
    case 'text': s = `getByText(${q(def.text!)}${opts(def, false)})`; break;
    case 'testid': s = `getByTestId(${q(def.testid!)})`; break;
    case 'placeholder': s = `getByPlaceholder(${q(def.placeholder!)}${opts(def, false)})`; break;
    case 'alt': s = `getByAltText(${q(def.alt!)}${opts(def, false)})`; break;
    case 'title': s = `getByTitle(${q(def.title!)}${opts(def, false)})`; break;
    case 'xpath': s = `locator(${q('xpath=' + def.xpath!)})`; break;
    case 'css': s = `locator(${q(def.css!)})`; break;
    default: s = 'locator(?)';
  }
  if (def.has_text !== undefined) s += `.filter({ hasText: ${q(def.has_text)} })`;
  if (def.nth !== undefined) s += `.nth(${def.nth})`;
  if (def.first) s += '.first()';
  if (def.last) s += '.last()';
  return s;
}

/**
 * Human readable Playwright-style description of a definition, e.g.
 * `getByRole('button', { name: 'Login' })`. Used in heal events and errors.
 * @public
 */
export function describeDef(def: LocatorDef): string {
  let s = describeOne(def);
  if (def.within) s = `within(${q(def.within)}).${s}`;
  for (const fb of def.fallbacks ?? []) s += `.or(${describeOne(fb)})`;
  return s;
}
