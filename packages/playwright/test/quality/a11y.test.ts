import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { A11yClient } from '../../src/quality/a11y';
import { TestFlyError } from '../../src/core/errors';
import { launchChromium } from '../helpers/browser';
import { fakeTestInfo } from '../helpers/fakeTestInfo';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchChromium();
  page = await (await browser.newContext()).newPage();
});
afterAll(async () => {
  await browser?.close();
});

const GOOD = '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>Hello</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="pixel"></main></body></html>';
const BAD = '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>Hello</h1><img class="hero" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><div id="skip"><img class="skipme" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></div></main></body></html>';

describe('A11yClient (axe-core on a real page)', () => {
  it('analyze returns no violations for an accessible page', async () => {
    await page.setContent(GOOD);
    const results = await new A11yClient(page).analyze({ tags: ['wcag2a', 'wcag2aa'] });
    expect(results.violations).toEqual([]);
    expect(results.passes.length).toBeGreaterThan(0);
  });

  it('assertNoViolations resolves on a clean page and attaches nothing', async () => {
    await page.setContent(GOOD);
    const info = fakeTestInfo();
    await new A11yClient(page, info).assertNoViolations();
    expect(info.attachments_).toHaveLength(0);
  });

  it('assertNoViolations throws TF_QUALITY_ASSERTION_FAILED, lists elements and attaches the violations', async () => {
    await page.setContent(BAD);
    const info = fakeTestInfo();
    const error = (await new A11yClient(page, info).assertNoViolations().catch((e: unknown) => e)) as TestFlyError;
    expect(error).toBeInstanceOf(TestFlyError);
    expect(error.code).toBe('TF_QUALITY_ASSERTION_FAILED');
    expect(error.message).toContain('image-alt');
    expect(error.message).toContain('.hero');
    expect(error.message).toMatch(/impact: (critical|serious)/);
    expect(error.details?.rules).toContain('image-alt');
    expect(info.attachments_).toHaveLength(1);
    expect(info.attachments_[0]).toMatchObject({ name: 'a11y-violations', contentType: 'application/json' });
    const parsed = JSON.parse(String(info.attachments_[0]!.body)) as Array<{ id: string }>;
    expect(parsed.map((v) => v.id)).toContain('image-alt');
  });

  it('works without a testInfo', async () => {
    await page.setContent(BAD);
    await expect(new A11yClient(page).assertNoViolations()).rejects.toMatchObject({ code: 'TF_QUALITY_ASSERTION_FAILED' });
  });

  it('exclude, disableRules and rules options are honoured', async () => {
    await page.setContent(BAD);
    const client = new A11yClient(page);
    const all = await client.analyze();
    expect(all.violations.find((v) => v.id === 'image-alt')?.nodes).toHaveLength(2);

    const excluded = await client.analyze({ exclude: '#skip' });
    expect(excluded.violations.find((v) => v.id === 'image-alt')?.nodes).toHaveLength(1);

    const included = await client.analyze({ include: '#skip' });
    expect(included.violations.find((v) => v.id === 'image-alt')?.nodes).toHaveLength(1);

    const disabled = await client.analyze({ disableRules: ['image-alt'] });
    expect(disabled.violations.map((v) => v.id)).not.toContain('image-alt');

    const only = await client.analyze({ rules: ['image-alt'] });
    expect(only.violations.map((v) => v.id)).toEqual(['image-alt']);
    await expect(client.assertNoViolations({ disableRules: ['image-alt'] })).resolves.toBeUndefined();
  });
});
