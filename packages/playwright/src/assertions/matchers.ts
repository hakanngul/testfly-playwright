import type { ExpectMatcherState, Locator, MatcherReturnType, Page } from '@playwright/test';

/**
 * Extra web-first matchers ported from TestFly (Java) that Playwright does not ship:
 * HTML5 form validation, password masking, count bounds and page storage/window checks.
 *
 * Like Playwright's own matchers they retry until `expect.timeout` (or `{ timeout }`) and support `.not`.
 * They are already registered on the `expect` exported by `@testfly/playwright`.
 *
 * @public
 */

const POLL_INTERVALS = [100, 250, 500, 1_000];

interface Probe<T> {
  read: () => Promise<T>;
  ok: (actual: T) => boolean;
}

/** Re-reads `probe` until `ok` matches the expected polarity or the timeout expires. */
async function poll<T>(state: ExpectMatcherState, probe: Probe<T>, timeout?: number): Promise<{ pass: boolean; actual: T | undefined; error?: unknown }> {
  const deadline = Date.now() + (timeout ?? state.timeout);
  let attempt = 0;
  let actual: T | undefined;
  let error: unknown;
  for (;;) {
    try {
      actual = await probe.read();
      error = undefined;
      const pass = probe.ok(actual);
      if (pass !== state.isNot) return { pass, actual };
    } catch (e) {
      error = e;
    }
    const wait = POLL_INTERVALS[Math.min(attempt++, POLL_INTERVALS.length - 1)]!;
    if (Date.now() + wait > deadline) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  // Report the last observed state (a read error counts as "condition not met").
  return { pass: error === undefined && actual !== undefined ? probe.ok(actual) : false, actual, error };
}

/** Per-call timeout override for the TestFly matchers. @public */
export interface MatcherTimeout {
  timeout?: number;
}

function result(
  state: ExpectMatcherState,
  name: string,
  outcome: { pass: boolean; actual: unknown; error?: unknown },
  expectation: string,
  received: string,
  expected?: unknown,
): MatcherReturnType {
  const not = state.isNot ? 'not ' : '';
  const detail = outcome.error ? `\nLast error: ${String((outcome.error as Error).message ?? outcome.error).split('\n')[0]}` : '';
  return {
    name,
    pass: outcome.pass,
    expected,
    actual: outcome.actual,
    message: () =>
      `${state.utils.matcherHint(name, undefined, undefined, { isNot: state.isNot })}\n\n` +
      `Expected ${received} ${not}${expectation}\n` +
      `Received: ${state.utils.printReceived(outcome.actual)}${detail}`,
  };
}

/** Snapshot of the form-related state of one element. */
interface FieldState {
  valid: boolean;
  validationMessage: string;
  required: boolean;
  readOnly: boolean;
  maxLength: number | null;
  type: string;
}

function fieldState(locator: Locator, timeout: number): Promise<FieldState> {
  return locator.evaluate(
    (el) => {
      const field = el as HTMLInputElement;
      const aria = (name: string) => el.getAttribute(name) === 'true';
      const hasValidity = typeof field.checkValidity === 'function';
      const maxLength = typeof field.maxLength === 'number' && field.maxLength >= 0 ? field.maxLength : null;
      return {
        valid: hasValidity ? field.checkValidity() : el.getAttribute('aria-invalid') !== 'true',
        validationMessage: typeof field.validationMessage === 'string' ? field.validationMessage : '',
        required: field.required === true || aria('aria-required'),
        readOnly: field.readOnly === true || aria('aria-readonly'),
        maxLength,
        type: (el.getAttribute('type') ?? '').toLowerCase(),
      };
    },
    undefined,
    { timeout },
  );
}

/** Per-read timeout: short, so a missing element does not consume the whole assertion budget. */
const READ_TIMEOUT = 1_000;

function fieldMatcher(name: string, expectation: string, ok: (s: FieldState) => boolean) {
  return async function (this: ExpectMatcherState, locator: Locator, options: MatcherTimeout = {}): Promise<MatcherReturnType> {
    const outcome = await poll(this, { read: () => fieldState(locator, READ_TIMEOUT), ok }, options.timeout);
    return result(this, name, outcome, expectation, 'locator');
  };
}

function textMatches(actual: string, expected: string | RegExp): boolean {
  return typeof expected === 'string' ? actual === expected : expected.test(actual);
}

export const testflyMatchers = {
  /** Field passes HTML5 constraint validation (`checkValidity()`, or `aria-invalid` for custom widgets). */
  toBeValid: fieldMatcher('toBeValid', 'to be valid', (s) => s.valid),

  /** Field fails HTML5 constraint validation. */
  toBeInvalid: fieldMatcher('toBeInvalid', 'to be invalid', (s) => !s.valid),

  /** Field has the `required` attribute or `aria-required="true"`. */
  toBeRequired: fieldMatcher('toBeRequired', 'to be required', (s) => s.required),

  /** Field has the `readonly` attribute or `aria-readonly="true"`. */
  toBeReadOnly: fieldMatcher('toBeReadOnly', 'to be read-only', (s) => s.readOnly),

  /** Input masks its value (`type="password"`). */
  toBePasswordHidden: fieldMatcher('toBePasswordHidden', 'to hide the password (type="password")', (s) => s.type === 'password'),

  /** Input shows its value (a "show password" toggle switched it away from `type="password"`). */
  toBePasswordVisible: fieldMatcher('toBePasswordVisible', 'to show the password (type is not "password")', (s) => s.type !== 'password'),

  /** Browser validation message equals `expected` (string) or matches it (RegExp). */
  async toHaveValidationMessage(this: ExpectMatcherState, locator: Locator, expected: string | RegExp, options: MatcherTimeout = {}): Promise<MatcherReturnType> {
    const outcome = await poll(
      this,
      { read: async () => (await fieldState(locator, READ_TIMEOUT)).validationMessage, ok: (m) => textMatches(m, expected) },
      options.timeout,
    );
    return result(this, 'toHaveValidationMessage', outcome, `to have validation message ${this.utils.printExpected(expected)}`, 'locator', expected);
  },

  /** `maxlength` of the field equals `expected`. */
  async toHaveMaxLength(this: ExpectMatcherState, locator: Locator, expected: number, options: MatcherTimeout = {}): Promise<MatcherReturnType> {
    const outcome = await poll(this, { read: async () => (await fieldState(locator, READ_TIMEOUT)).maxLength, ok: (n) => n === expected }, options.timeout);
    return result(this, 'toHaveMaxLength', outcome, `to have maxlength ${expected}`, 'locator', expected);
  },

  /** Visible label of the selected `<option>` equals `expected` (string) or matches it (RegExp). */
  async toHaveSelectedOption(this: ExpectMatcherState, locator: Locator, expected: string | RegExp, options: MatcherTimeout = {}): Promise<MatcherReturnType> {
    const outcome = await poll(
      this,
      {
        read: () =>
          locator.evaluate(
            (el) => {
              const select = el as HTMLSelectElement;
              const option = select.selectedOptions?.[0];
              return option ? (option.label || option.textContent || '').trim() : '';
            },
            undefined,
            { timeout: READ_TIMEOUT },
          ),
        ok: (label) => textMatches(label, expected),
      },
      options.timeout,
    );
    return result(this, 'toHaveSelectedOption', outcome, `to have selected option ${this.utils.printExpected(expected)}`, 'locator', expected);
  },

  /** Locator matches at least `min` elements. */
  async toHaveCountAtLeast(this: ExpectMatcherState, locator: Locator, min: number, options: MatcherTimeout = {}): Promise<MatcherReturnType> {
    const outcome = await poll(this, { read: () => locator.count(), ok: (n) => n >= min }, options.timeout);
    return result(this, 'toHaveCountAtLeast', outcome, `to match at least ${min} element(s)`, 'locator', min);
  },

  /** Locator matches at most `max` elements. */
  async toHaveCountAtMost(this: ExpectMatcherState, locator: Locator, max: number, options: MatcherTimeout = {}): Promise<MatcherReturnType> {
    const outcome = await poll(this, { read: () => locator.count(), ok: (n) => n <= max }, options.timeout);
    return result(this, 'toHaveCountAtMost', outcome, `to match at most ${max} element(s)`, 'locator', max);
  },

  /** The page's browser context has a cookie `name` (optionally with the given value). */
  async toHaveCookie(this: ExpectMatcherState, page: Page, name: string, value?: string | RegExp, options: MatcherTimeout = {}): Promise<MatcherReturnType> {
    const outcome = await poll(
      this,
      {
        read: async () => (await page.context().cookies()).find((c) => c.name === name)?.value ?? null,
        ok: (v) => v !== null && (value === undefined || textMatches(v, value)),
      },
      options.timeout,
    );
    const what = value === undefined ? `to have cookie "${name}"` : `to have cookie "${name}" = ${this.utils.printExpected(value)}`;
    return result(this, 'toHaveCookie', outcome, what, 'page', value);
  },

  /** `localStorage[key]` exists on the page's origin (optionally with the given value). */
  async toHaveLocalStorageItem(this: ExpectMatcherState, page: Page, key: string, value?: string | RegExp, options: MatcherTimeout = {}): Promise<MatcherReturnType> {
    const outcome = await poll(
      this,
      {
        read: () => page.evaluate((k) => window.localStorage.getItem(k), key),
        ok: (v) => v !== null && (value === undefined || textMatches(v, value)),
      },
      options.timeout,
    );
    const what = value === undefined ? `to have localStorage item "${key}"` : `to have localStorage "${key}" = ${this.utils.printExpected(value)}`;
    return result(this, 'toHaveLocalStorageItem', outcome, what, 'page', value);
  },

  /** The page's browser context has exactly `count` open pages (tabs/popups). */
  async toHaveWindowCount(this: ExpectMatcherState, page: Page, count: number, options: MatcherTimeout = {}): Promise<MatcherReturnType> {
    const outcome = await poll(this, { read: async () => page.context().pages().length, ok: (n) => n === count }, options.timeout);
    return result(this, 'toHaveWindowCount', outcome, `to have ${count} open window(s)`, 'page', count);
  },
};

/** Type augmentation so the extra matchers are typed on the TestFly `expect`. @public */
export type TestFlyMatchers = typeof testflyMatchers;
