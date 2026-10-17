import { z } from 'zod';
import { TestFlyError } from '../core/errors';
import { LocatorDef, MOBILE_SELECTOR_FIELDS, SELECTOR_FIELDS, type MobileDefKey, type MobileLocatorDef } from './types';

const text = z.union([z.string(), z.number()]).transform((v) => String(v));
const nonEmpty = text.refine((v) => v.length > 0, 'must not be empty');

const LeafSchema = z.strictObject({
  role: nonEmpty.optional(),
  name: text.optional(),
  exact: z.boolean().optional(),
  level: z.number().int().min(1).max(6).optional(),
  label: nonEmpty.optional(),
  text: nonEmpty.optional(),
  testid: nonEmpty.optional(),
  placeholder: nonEmpty.optional(),
  alt: nonEmpty.optional(),
  title: nonEmpty.optional(),
  css: nonEmpty.optional(),
  xpath: nonEmpty.optional(),
  nth: z.number().int().min(0).optional(),
  first: z.boolean().optional(),
  last: z.boolean().optional(),
  has_text: text.optional(),
  within: nonEmpty.optional(),
  // legacy shape (`type` + `value`), converted below
  type: z.string().optional(),
  value: text.optional(),
});

const PLATFORM_KEYS = ['web', 'ios', 'android', 'mobile'];
const MOBILE_KEYS: MobileDefKey[] = ['ios', 'android', 'mobile'];

const MobileLeafSchema = z.strictObject({
  role: nonEmpty.optional(),
  name: text.optional(),
  exact: z.boolean().optional(),
  label: nonEmpty.optional(),
  text: nonEmpty.optional(),
  testid: nonEmpty.optional(),
  placeholder: nonEmpty.optional(),
  type: nonEmpty.optional(),
  nth: z.number().int().min(0).optional(),
  first: z.boolean().optional(),
  last: z.boolean().optional(),
  has_text: text.optional(),
  within: nonEmpty.optional(),
});

/** Normalize an `ios:` / `android:` / `mobile:` block. A plain string is a test id. @internal */
export function normalizeMobileDef(raw: unknown, key: string, file?: string): MobileLocatorDef {
  if (typeof raw === 'string') {
    if (raw.trim() === '') fail(file, key, 'mobile selector string is empty');
    return { testid: raw };
  }
  if (!isObject(raw)) fail(file, key, `mobile definition must be a test id string or an object, got ${raw === null ? 'null' : typeof raw}`);
  const { fallbacks, ...leafRaw } = raw;
  const parsed = MobileLeafSchema.safeParse(leafRaw);
  if (!parsed.success) {
    fail(file, key, parsed.error.issues.map((i) => `${i.path.length ? `"${i.path.join('.')}": ` : ''}${i.message}`).join('; '));
  }
  const fields = parsed.data;
  const present = MOBILE_SELECTOR_FIELDS.filter((f) => fields[f] !== undefined);
  if (present.length === 0) fail(file, key, `no mobile selector field found (use one of: ${MOBILE_SELECTOR_FIELDS.join(', ')})`);
  if (present.length > 1) fail(file, key, `multiple mobile selector fields (${present.join(', ')}); use one and put the others in "fallbacks"`);
  if (fields.name !== undefined && fields.role === undefined) fail(file, key, '"name" is only valid together with "role"');
  const def: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) def[k] = v;
  if (fallbacks !== undefined) {
    if (!Array.isArray(fallbacks)) fail(file, key, '"fallbacks" must be a list');
    def.fallbacks = fallbacks.map((fb, i) => {
      const n = normalizeMobileDef(fb, `${key}.fallbacks[${i}]`, file);
      if (n.fallbacks) fail(file, key, `fallbacks[${i}] must not have nested fallbacks`);
      return n;
    });
  }
  return def as MobileLocatorDef;
}

const WEB_ONLY_FIELDS = ['css', 'xpath', 'alt', 'title', 'level'] as const;

/**
 * Mobile definition of a locator for `platform`: its `ios:`/`android:` block, else `mobile:`, else the
 * shared definition when it only uses fields that exist on mobile (role/label/text/testid/placeholder).
 * `undefined` when the key has no usable mobile definition.
 *
 * @public
 */
export function selectPlatformDef(def: LocatorDef, platform: 'ios' | 'android'): MobileLocatorDef | undefined {
  const own = def.platforms?.[platform] ?? def.platforms?.mobile;
  if (own) return own;
  if (!SELECTOR_FIELDS.some((f) => def[f] !== undefined)) return undefined;
  if (WEB_ONLY_FIELDS.some((f) => def[f] !== undefined)) return undefined;
  const { platforms: _p, level: _l, fallbacks, ...shared } = def;
  const fbs = (fallbacks ?? []).filter((fb) => !WEB_ONLY_FIELDS.some((f) => fb[f] !== undefined)) as MobileLocatorDef[];
  return { ...(shared as MobileLocatorDef), ...(fbs.length ? { fallbacks: fbs } : {}) };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(file: string | undefined, key: string, message: string): never {
  throw new TestFlyError('TF_LOCATOR_INVALID', `Invalid locator "${key}"${file ? ` in ${file}` : ''}: ${message}`, {
    hint: `Use exactly one of: ${SELECTOR_FIELDS.join(', ')} (plus nth/first/last/has_text/within/fallbacks).`,
    details: { key, file },
  });
}

function legacyToFields(raw: z.infer<typeof LeafSchema>, file: string | undefined, key: string): Record<string, unknown> {
  const { type, value, ...rest } = raw;
  if (type === undefined) {
    if (value !== undefined) fail(file, key, '"value" requires "type"');
    return rest;
  }
  switch (type) {
    case 'role':
      if (rest.role === undefined && value === undefined) fail(file, key, 'type "role" needs "role" or "value"');
      return { ...rest, role: rest.role ?? value, name: rest.name ?? (rest.role !== undefined ? value : undefined) };
    case 'label':
    case 'text':
    case 'testid':
    case 'placeholder':
    case 'alt':
    case 'title':
    case 'css':
    case 'xpath':
      if (value === undefined) fail(file, key, `type "${type}" needs "value"`);
      return { ...rest, [type]: value };
    default:
      return fail(file, key, `unsupported legacy type "${type}"`);
  }
}

/** Normalize one raw definition (string | object) into a {@link LocatorDef}. @internal */
export function normalizeDef(raw: unknown, key: string, file?: string): LocatorDef {
  if (typeof raw === 'string') {
    if (raw.trim() === '') fail(file, key, 'selector string is empty');
    return { css: raw };
  }
  if (!isObject(raw)) fail(file, key, `expected a selector string or an object, got ${raw === null ? 'null' : typeof raw}`);

  // Platform keys: `web:` is an alias for the definition itself; `ios:`/`android:`/`mobile:` are kept as
  // native mobile definitions (used by @testfly/mobile).
  const obj: Record<string, unknown> = { ...raw };
  const web = obj.web;
  const platforms: Partial<Record<MobileDefKey, MobileLocatorDef>> = {};
  for (const k of MOBILE_KEYS) {
    if (obj[k] !== undefined) platforms[k] = normalizeMobileDef(obj[k], `${key}.${k}`, file);
  }
  const hasPlatforms = Object.keys(platforms).length > 0;
  for (const k of PLATFORM_KEYS) delete obj[k];
  if (hasPlatforms && web === undefined && Object.keys(obj).length === 0) {
    // Mobile-only key.
    return { platforms };
  }
  let base: Record<string, unknown> = obj;
  if (web !== undefined) {
    const webObj = typeof web === 'string' ? { css: web } : isObject(web) ? web : fail(file, key, '"web" must be a selector or an object');
    base = { ...webObj, ...(obj.fallbacks !== undefined && webObj.fallbacks === undefined ? { fallbacks: obj.fallbacks } : {}) };
  }

  const { fallbacks, ...leafRaw } = base;
  const parsed = LeafSchema.safeParse(leafRaw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.length ? `"${i.path.join('.')}": ` : ''}${i.message}`)
      .join('; ');
    fail(file, key, msg);
  }
  const fields = legacyToFields(parsed.data, file, key);

  const present = SELECTOR_FIELDS.filter((f) => fields[f] !== undefined);
  if (present.length === 0) fail(file, key, 'no selector field found');
  if (present.length > 1) fail(file, key, `multiple selector fields (${present.join(', ')}); use one and put the others in "fallbacks"`);
  if ((fields.name !== undefined || fields.level !== undefined) && fields.role === undefined) fail(file, key, '"name"/"level" are only valid together with "role"');

  const def: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) def[k] = v;

  if (fallbacks !== undefined) {
    if (!Array.isArray(fallbacks)) fail(file, key, '"fallbacks" must be a list');
    def.fallbacks = fallbacks.map((fb, i) => {
      const n = normalizeDef(fb, `${key}.fallbacks[${i}]`, file);
      if (n.fallbacks) fail(file, key, `fallbacks[${i}] must not have nested fallbacks`);
      return n;
    });
  }
  if (hasPlatforms) def.platforms = platforms;
  return def as LocatorDef;
}
