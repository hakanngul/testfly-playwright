import type { TriageCategory } from './schema';

/** Extra signals available when triaging a failure. @public */
export interface TriageContext {
  retries: number;
  passedOnRetry: boolean;
  heals: number;
}

interface TriageRule {
  /** Short id, useful when debugging classification. */
  id: string;
  /** Matches against the ANSI-stripped error message (and stack when `useStack`). */
  pattern: RegExp;
  category: TriageCategory;
  /** Optional additional predicate on the context. */
  when?: (ctx: TriageContext) => boolean;
  /** Also test the pattern against the stack trace. */
  useStack?: boolean;
}

/**
 * Ordered triage table. The FIRST matching rule wins, so order encodes priority:
 * infrastructure noise first, then test-code defects, then genuine assertion mismatches,
 * then generic timeouts.
 *
 * @internal
 */
export const TRIAGE_RULES: readonly TriageRule[] = [
  // 1. Heal-related failures need a human: the locator moved or the healer was involved.
  { id: 'heal-error', pattern: /TF_HEAL|heal(ing)?\b.*(fail|reject|low confidence)|low[- ]confidence/i, category: 'NEEDS_INVESTIGATION' },
  { id: 'heals-with-locator-failure', pattern: /locator|element\(s\) not found|waiting for/i, category: 'NEEDS_INVESTIGATION', when: (c) => c.heals > 0 },
  // 2. Infrastructure / environment noise.
  { id: 'network', pattern: /net::ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|NS_ERROR_(NET|CONNECTION)/i, category: 'SYSTEM_FLAKY' },
  { id: 'browser-closed', pattern: /(Target|Browser|Page|Context)( page, context or browser)? has been closed|browser has disconnected|Target crashed|Page crashed|Browser closed/i, category: 'SYSTEM_FLAKY' },
  { id: 'http-5xx', pattern: /\b(500|502|503|504)\b.*(Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out)|status(?: code)?:?\s*5\d\d|\b5\d\d\b\s+(Internal|Bad|Service|Gateway)/i, category: 'SYSTEM_FLAKY' },
  // 3. Defects in the test itself.
  { id: 'tf-locator', pattern: /TF_LOCATOR/i, category: 'TEST_BUG' },
  { id: 'strict-mode', pattern: /strict mode violation/i, category: 'TEST_BUG' },
  { id: 'js-error-in-test', pattern: /\b(TypeError|ReferenceError|SyntaxError)\b/, category: 'TEST_BUG' },
  { id: 'locator-not-found', pattern: /element\(s\) not found|waiting for (?:getBy\w+|locator)\(|no element matches/i, category: 'TEST_BUG' },
  // 4. Genuine assertion mismatch on application data.
  { id: 'assertion-mismatch', pattern: /expect\([^)]*\)\.(?:not\.)?to\w+[\s\S]*?(?:Expected|Received)|Expected(?: string| substring| pattern| value| array)?:[\s\S]*Received/i, category: 'APPLICATION_BUG' },
  // 5. Generic timeouts are most often slow environments.
  { id: 'timeout', pattern: /Timeout (?:of )?\d+ms exceeded|timed out|TimeoutError/i, category: 'SYSTEM_FLAKY' },
];

/** Removes ANSI escape sequences (Playwright colors assertion output). */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Zero-token heuristic classification of a failure. A test that failed and then passed on retry
 * is always SYSTEM_FLAKY; otherwise the first matching rule of {@link TRIAGE_RULES} wins and
 * unknown failures are NEEDS_INVESTIGATION.
 *
 * @public
 */
export function triageFailure(
  error: { message: string; stack?: string },
  context: TriageContext = { retries: 0, passedOnRetry: false, heals: 0 },
): TriageCategory {
  if (context.passedOnRetry) return 'SYSTEM_FLAKY';
  const message = stripAnsi(error.message ?? '');
  const stack = error.stack ? stripAnsi(error.stack) : '';
  for (const rule of TRIAGE_RULES) {
    if (rule.when && !rule.when(context)) continue;
    if (rule.pattern.test(message) || (rule.useStack && rule.pattern.test(stack))) return rule.category;
  }
  return 'NEEDS_INVESTIGATION';
}
