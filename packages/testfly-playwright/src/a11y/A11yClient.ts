import { Page, Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AxeResults, Result } from 'axe-core';

export interface A11yOptions {
  include?: string | string[];
  exclude?: string | string[];
  tags?: string[];
  rules?: string[];
  disableRules?: string[];
  scope?: Locator | string;
}

export class A11yClient {
  constructor(private page: Page) {}

  /**
   * Run Axe accessibility audit on the page or specific scoped element
   */
  async analyze(options: A11yOptions = {}): Promise<AxeResults> {
    let builder = new AxeBuilder({ page: this.page });

    if (options.tags && options.tags.length > 0) {
      builder = builder.withTags(options.tags);
    }

    if (options.rules && options.rules.length > 0) {
      builder = builder.withRules(options.rules);
    }

    if (options.disableRules && options.disableRules.length > 0) {
      builder = builder.disableRules(options.disableRules);
    }

    if (options.include) {
      const inc = Array.isArray(options.include) ? options.include : [options.include];
      builder = builder.include(inc);
    }

    if (options.exclude) {
      const exc = Array.isArray(options.exclude) ? options.exclude : [options.exclude];
      builder = builder.exclude(exc);
    }

    if (options.scope) {
      if (typeof options.scope === 'string') {
        builder = builder.include(options.scope);
      }
    }

    return await builder.analyze();
  }

  /**
   * Assert that there are zero accessibility violations.
   * Throws detailed error if violations are detected.
   */
  async assertNoViolations(options: A11yOptions = {}): Promise<void> {
    const results = await this.analyze(options);
    if (results.violations.length > 0) {
      const formattedViolations = this.formatViolations(results.violations);
      throw new Error(
        `❌ Accessibility (A11y) Assert Failed: Found ${results.violations.length} violation(s):\n\n${formattedViolations}`
      );
    }
  }

  private formatViolations(violations: Result[]): string {
    return violations
      .map((v, i) => {
        const nodes = v.nodes
          .map((n) => `    - Target: ${n.target.join(' ')}\n      Summary: ${n.failureSummary || 'N/A'}`)
          .join('\n');

        return `[${i + 1}] Rule: "${v.id}" (Impact: ${v.impact || 'unknown'})
  Description: ${v.description}
  Help: ${v.help} (${v.helpUrl})
  Affected Elements (${v.nodes.length}):
${nodes}\n`;
      })
      .join('\n');
  }
}
