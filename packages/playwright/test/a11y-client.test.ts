import { describe, it, expect, vi } from 'vitest';
import { A11yClient } from '../src/quality/a11y/A11yClient';

// Mock AxeBuilder
vi.mock('@axe-core/playwright', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        withTags: vi.fn().mockReturnThis(),
        withRules: vi.fn().mockReturnThis(),
        disableRules: vi.fn().mockReturnThis(),
        include: vi.fn().mockReturnThis(),
        exclude: vi.fn().mockReturnThis(),
        analyze: vi.fn().mockResolvedValue({
          violations: [],
          passes: [{ id: 'color-contrast' }],
        }),
      };
    }),
  };
});

describe('A11yClient', () => {
  it('should run accessibility audit and pass when 0 violations found', async () => {
    const mockPage: any = {};
    const a11y = new A11yClient(mockPage);

    const results = await a11y.analyze({ tags: ['wcag2a', 'wcag2aa'] });
    expect(results.violations).toHaveLength(0);
    expect(results.passes).toHaveLength(1);
  });

  it('should throw descriptive error when violations exist during assertNoViolations', async () => {
    const mockPage: any = {};
    const a11y = new A11yClient(mockPage);

    // Override analyze to return a violation
    vi.spyOn(a11y, 'analyze').mockResolvedValueOnce({
      violations: [
        {
          id: 'image-alt',
          impact: 'critical',
          description: 'Images must have alternate text',
          help: 'Elements must have alt prop',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/image-alt',
          nodes: [{ target: ['img.hero'], failureSummary: 'Fix any of the following' }],
        } as any,
      ],
    } as any);

    await expect(a11y.assertNoViolations()).rejects.toThrowError(/Accessibility \(A11y\) Assert Failed/);
  });
});
