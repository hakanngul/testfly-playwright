/**
 * Locator catalog types.
 *
 * A catalog is a directory of YAML files. Each file is a "page" and every top-level key
 * is a locator: `locators/login.yaml` → key `login.submit`.
 */

/**
 * Typed locator keys. `testfly locators` generates a `.d.ts` that augments
 * {@link TestFly.LocatorMap}; without it every string is accepted.
 */
declare global {
  namespace TestFly {
    /** Augmented by the generated `locators/index.d.ts`. @public */
    interface LocatorMap {}
    /** Union of known locator keys (falls back to `string` when no catalog was generated). @public */
    type LocatorPath = keyof LocatorMap extends never ? string : Extract<keyof LocatorMap, string>;
  }
}

/** Typed locator key with autocompletion that still accepts any string. @public */
export type TypedLocatorKey = TestFly.LocatorPath | (string & {});

/**
 * One normalized locator definition. Exactly one "selector field" is set
 * (`role`, `label`, `text`, `testid`, `placeholder`, `alt`, `title`, `css`, `xpath`);
 * the rest are modifiers.
 *
 * @public
 */
export interface LocatorDef {
  /** ARIA role → `getByRole(role, { name, exact, level })`. */
  role?: string;
  /** Accessible name (only with `role`). */
  name?: string;
  /** Exact matching for `name`, `label`, `text`, `placeholder`, `alt`, `title`. */
  exact?: boolean;
  /** Heading level (only with `role`). */
  level?: number;
  label?: string;
  text?: string;
  testid?: string;
  placeholder?: string;
  alt?: string;
  title?: string;
  css?: string;
  xpath?: string;
  /** Zero based index applied after the selector. */
  nth?: number;
  first?: boolean;
  last?: boolean;
  /** Keep only matches containing this text. */
  has_text?: string;
  /** Key of another locator that scopes this one (chained). */
  within?: string;
  /** Alternative definitions tried (as `locator.or(...)`) when the primary does not match. */
  fallbacks?: LocatorDef[];
}

/** Names of the fields that select an element. @public */
export const SELECTOR_FIELDS = ['role', 'label', 'text', 'testid', 'placeholder', 'alt', 'title', 'css', 'xpath'] as const;
/** @public */
export type SelectorField = (typeof SELECTOR_FIELDS)[number];

/** Alias kept for backwards compatibility. @public */
export type SingleLocatorDef = LocatorDef;
/** @deprecated Mobile platform keys were removed; kept as an alias of {@link LocatorDef}. @public */
export type PlatformLocatorDef = LocatorDef;

/** @public */
export interface ParsedLocatorItem {
  page: string;
  name: string;
  /** e.g. `login.username_input` */
  fullKey: string;
  definition: LocatorDef;
  /** Source file, when parsed from disk. */
  file?: string;
}
