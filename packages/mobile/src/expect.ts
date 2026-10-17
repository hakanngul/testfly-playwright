import { expect as webExpect } from '@testfly/playwright';
import type { Locator as MobileLocator } from 'mobilewright';
import { loadedMobilewright } from './runtime';

/** Options of the mobile locator assertions. @public */
export interface MobileExpectOptions {
  timeout?: number;
}

/** Options of the mobile text assertions. @public */
export interface MobileExpectTextOptions extends MobileExpectOptions {
  /** Ignore case. */
  ignoreCase?: boolean;
}

/**
 * Web-first assertions for a Mobilewright locator (retried until the expect timeout).
 * Same names as Playwright's locator assertions.
 *
 * @public
 */
export interface MobileLocatorAssertions {
  readonly not: MobileLocatorAssertions;
  toBeVisible(opts?: MobileExpectOptions): Promise<void>;
  toBeHidden(opts?: MobileExpectOptions): Promise<void>;
  toBeEnabled(opts?: MobileExpectOptions): Promise<void>;
  toBeDisabled(opts?: MobileExpectOptions): Promise<void>;
  toBeSelected(opts?: MobileExpectOptions): Promise<void>;
  toBeFocused(opts?: MobileExpectOptions): Promise<void>;
  toBeChecked(opts?: MobileExpectOptions): Promise<void>;
  toHaveText(expected: string | RegExp, opts?: MobileExpectTextOptions): Promise<void>;
  toContainText(expected: string | RegExp, opts?: MobileExpectTextOptions): Promise<void>;
  toHaveCount(expected: number, opts?: MobileExpectOptions): Promise<void>;
  toBeEmpty(opts?: MobileExpectOptions): Promise<void>;
  toHaveValue(expected: string | RegExp, opts?: MobileExpectOptions): Promise<void>;
}

type WebExpect = typeof webExpect;

/**
 * `expect` of `@testfly/mobile`: a Mobilewright locator (`mobileScreen.getBy*`, `mobileLocate(key)`) gets the
 * mobile assertions; everything else (values, web pages and locators, API responses) goes to the
 * TestFly/Playwright `expect` with all its matchers. `expect.soft` dispatches the same way.
 *
 * @public
 */
export interface TestFlyMobileExpect extends WebExpect {
  (actual: MobileLocator, message?: string): MobileLocatorAssertions;
  soft: WebExpect['soft'] & ((actual: MobileLocator, message?: string) => MobileLocatorAssertions);
}

function isMobileLocator(value: unknown): boolean {
  const mw = loadedMobilewright();
  // Without a loaded module no device was opened in this worker, so the value cannot be a mobile locator.
  return !!mw && typeof value === 'object' && value !== null && value instanceof mw.Locator;
}

type AnyFn = (...args: any[]) => unknown;

function soft(...args: any[]): unknown {
  const mw = loadedMobilewright();
  if (mw && isMobileLocator(args[0])) return (mw.expect.soft as AnyFn)(...args);
  return (webExpect.soft as AnyFn)(...args);
}

/** @public */
export const expect: TestFlyMobileExpect = new Proxy(webExpect, {
  apply(target, thisArg, args: any[]) {
    const mw = loadedMobilewright();
    if (mw && isMobileLocator(args[0])) return (mw.expect as AnyFn)(...args);
    return Reflect.apply(target as unknown as AnyFn, thisArg, args);
  },
  get(target, prop, receiver) {
    return prop === 'soft' ? soft : Reflect.get(target, prop, receiver);
  },
}) as unknown as TestFlyMobileExpect;
