import { describe, expect, it } from 'vitest';
import { stripAnsi, TRIAGE_RULES, triageFailure } from '../src/triage';

const ctx = (over: Partial<{ retries: number; passedOnRetry: boolean; heals: number }> = {}) => ({ retries: 0, passedOnRetry: false, heals: 0, ...over });

const TIMEOUT_MSG = 'Test timeout of 30000ms exceeded.';
const LOCATOR_TIMEOUT = `Error: locator.click: Timeout 5000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Submit' })`;

describe('triageFailure rules', () => {
  it.each([
    ['net::ERR_CONNECTION_REFUSED', 'page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/', 'SYSTEM_FLAKY'],
    ['net::ERR_NAME_NOT_RESOLVED', 'page.goto: net::ERR_NAME_NOT_RESOLVED at https://example.invalid/', 'SYSTEM_FLAKY'],
    ['ECONNRESET', 'apiRequestContext.get: read ECONNRESET', 'SYSTEM_FLAKY'],
    ['socket hang up', 'apiRequestContext.post: socket hang up', 'SYSTEM_FLAKY'],
    ['browser closed', 'page.click: Target page, context or browser has been closed', 'SYSTEM_FLAKY'],
    ['page crashed', 'page.evaluate: Page crashed', 'SYSTEM_FLAKY'],
    ['5xx status text', 'Error: expected OK but got 503 Service Unavailable', 'SYSTEM_FLAKY'],
    ['status: 502', 'Request failed, status: 502', 'SYSTEM_FLAKY'],
    ['strict mode violation', "Error: locator.click: Error: strict mode violation: getByRole('link') resolved to 3 elements:", 'TEST_BUG'],
    ['TypeError in test', "TypeError: Cannot read properties of undefined (reading 'click')", 'TEST_BUG'],
    ['ReferenceError in test', 'ReferenceError: foo is not defined', 'TEST_BUG'],
    ['SyntaxError', 'SyntaxError: Unexpected token } in JSON at position 5', 'TEST_BUG'],
    ['expect element(s) not found', "Error: expect(locator).toBeVisible()\n\nLocator: getByText('Hi')\nExpected: visible\nReceived: <element(s) not found>", 'TEST_BUG'],
    ['waiting for locator timeout → not found', "Error: page.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator('#nope')", 'TEST_BUG'],
    ['TF_LOCATOR error', '[TF_LOCATOR_NOT_FOUND] Could not resolve key "login.button"', 'TEST_BUG'],
    ['toHaveText mismatch', "Error: expect(locator).toHaveText(expected)\n\nLocator: locator('h1')\nExpected string: \"Welcome\"\nReceived string: \"Hello\"", 'APPLICATION_BUG'],
    ['toBe mismatch', 'Error: expect(received).toBe(expected) // Object.is equality\n\nExpected: 200\nReceived: 404', 'APPLICATION_BUG'],
    ['toEqual with Received', 'expect(received).toEqual(expected)\n\nExpected: {"a":1}\nReceived: {"a":2}', 'APPLICATION_BUG'],
    ['generic test timeout', TIMEOUT_MSG, 'SYSTEM_FLAKY'],
    ['TimeoutError', 'TimeoutError: page.waitForSelector: Timeout 1000ms exceeded.', 'SYSTEM_FLAKY'],
    ['heal error', '[TF_HEAL_REJECTED] healing failed: low confidence 0.31', 'NEEDS_INVESTIGATION'],
    ['unknown', 'Something totally unexpected', 'NEEDS_INVESTIGATION'],
    ['empty message', '', 'NEEDS_INVESTIGATION'],
  ] as const)('%s → %s', (_n, message, expected) => {
    expect(triageFailure({ message })).toBe(expected);
  });

  it('passedOnRetry always wins (even for assertion mismatch)', () => {
    const msg = 'expect(received).toBe(expected)\nExpected: 1\nReceived: 2';
    expect(triageFailure({ message: msg }, ctx({ passedOnRetry: true, retries: 1 }))).toBe('SYSTEM_FLAKY');
  });

  it('heals>0 with a locator failure needs investigation, but not without heals', () => {
    expect(triageFailure({ message: LOCATOR_TIMEOUT }, ctx({ heals: 1 }))).toBe('NEEDS_INVESTIGATION');
    expect(triageFailure({ message: LOCATOR_TIMEOUT }, ctx())).toBe('TEST_BUG');
  });

  it('network beats timeout and assertion (priority order)', () => {
    expect(triageFailure({ message: 'Timeout 30000ms exceeded. net::ERR_INTERNET_DISCONNECTED' })).toBe('SYSTEM_FLAKY');
  });

  it('strips ANSI colour codes before matching', () => {
    const colored = '\u001b[2mexpect(\u001b[22m\u001b[31mlocator\u001b[39m\u001b[2m).\u001b[22mtoHaveText\u001b[2m(\u001b[22m\u001b[32mexpected\u001b[39m\u001b[2m)\u001b[22m\n\nExpected: \u001b[32m"a"\u001b[39m\nReceived: \u001b[31m"b"\u001b[39m';
    expect(triageFailure({ message: colored })).toBe('APPLICATION_BUG');
    expect(stripAnsi(colored)).not.toContain('\u001b');
  });

  it('default context is accepted', () => {
    expect(triageFailure({ message: 'x' })).toBe('NEEDS_INVESTIGATION');
  });

  it('TRIAGE_RULES has unique ids and every rule is reachable by some message', () => {
    const ids = TRIAGE_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['network', 'strict-mode', 'js-error-in-test', 'assertion-mismatch', 'timeout', 'http-5xx', 'locator-not-found', 'tf-locator', 'browser-closed', 'heal-error', 'heals-with-locator-failure']));
  });

  it('5xx rule does not trigger on innocuous numbers', () => {
    expect(triageFailure({ message: 'Expected 1500 items' })).not.toBe('SYSTEM_FLAKY');
    expect(triageFailure({ message: 'user id 5000 missing' })).toBe('NEEDS_INVESTIGATION');
  });
});
