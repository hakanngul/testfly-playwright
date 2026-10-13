import type { Page, TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TestFlyError } from '../../core/errors';

/** Result of an axe analysis (derived from `@axe-core/playwright`, no direct axe-core import). @public */
export type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
/** A single axe violation. @public */
export type AxeViolation = AxeResults['violations'][number];

/** Options for {@link A11yClient}. @public */
export interface A11yOptions {
  /** CSS selector(s) to restrict the audit to. */
  include?: string | string[];
  /** CSS selector(s) to leave out. */
  exclude?: string | string[];
  /** axe tags, e.g. `['wcag2a', 'wcag2aa']`. */
  tags?: string[];
  /** Run only these rule ids. */
  rules?: string[];
  /** Disable these rule ids. */
  disableRules?: string[];
}

/**
 * Accessibility audits powered by axe-core. Exposed as the `a11y` fixture.
 * @public
 */
export class A11yClient {
  constructor(
    private readonly page: Page,
    private readonly testInfo?: TestInfo,
  ) {}

  /** Run an axe audit on the page. */
  async analyze(options: A11yOptions = {}): Promise<AxeResults> {
    let builder = new AxeBuilder({ page: this.page });
    if (options.tags?.length) builder = builder.withTags(options.tags);
    if (options.rules?.length) builder = builder.withRules(options.rules);
    if (options.disableRules?.length) builder = builder.disableRules(options.disableRules);
    if (options.include) builder = builder.include(options.include);
    if (options.exclude) builder = builder.exclude(options.exclude);
    return builder.analyze();
  }

  /**
   * Assert there are no violations.
   * @throws TestFlyError `TF_QUALITY_ASSERTION_FAILED` listing every violation.
   */
  async assertNoViolations(options: A11yOptions = {}): Promise<void> {
    const results = await this.analyze(options);
    if (results.violations.length === 0) return;
    await this.testInfo?.attach('a11y-violations', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' });
    throw new TestFlyError(
      'TF_QUALITY_ASSERTION_FAILED',
      `Accessibility audit found ${results.violations.length} violation(s):\n\n${formatViolations(results.violations)}`,
      { hint: 'Fix the listed elements or exclude them explicitly with { exclude } / { disableRules }.', details: { rules: results.violations.map((v) => v.id) } },
    );
  }
}

function formatViolations(violations: AxeViolation[]): string {
  return violations
    .map((v, i) => {
      const nodes = v.nodes.map((n) => `    - ${n.target.join(' ')}\n      ${n.failureSummary ?? ''}`.trimEnd()).join('\n');
      return `[${i + 1}] ${v.id} (impact: ${v.impact ?? 'unknown'})\n  ${v.help} (${v.helpUrl})\n  Elements (${v.nodes.length}):\n${nodes}\n`;
    })
    .join('\n');
}
