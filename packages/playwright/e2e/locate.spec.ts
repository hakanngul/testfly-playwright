import { expect, test } from './support/test';

test.describe('locate fixture (YAML catalog)', () => {
  test('resolves a key to a plain Playwright locator', async ({ page, locate }) => {
    await page.setContent('<h1>Welcome back</h1>');
    await expect(locate('home.heading')).toHaveText('Welcome back');
    expect(typeof locate('home.heading').click).toBe('function');
  });

  test('YAML fallbacks are part of the locator (no healing event)', async ({ page, locate }, testInfo) => {
    await page.setContent('<button id="legacy-cta">Go</button>');
    await expect(locate('home.cta')).toHaveText('Go');
    expect(testInfo.annotations.some((a) => a.type === 'healed')).toBe(false);
  });

  test('unknown keys throw TF_LOCATOR_NOT_FOUND', async ({ locate }) => {
    expect(() => locate('home.nope')).toThrow(/TF_LOCATOR_NOT_FOUND/);
  });

  test('heal() repairs a broken selector, annotates and attaches a heal event', async ({ page, locate }, testInfo) => {
    await page.setContent('<button data-testid="submit-btn">Send</button>');
    const healed = await locate.heal('home.submit');
    await expect(healed).toHaveText('Send');
    const annotation = testInfo.annotations.find((a) => a.type === 'healed');
    expect(annotation?.description).toContain('home.submit');
  });

  test('resolve() returns the original locator when it matches (no healing)', async ({ page, locate }, testInfo) => {
    await page.setContent('<h1>Welcome</h1>');
    const loc = await locate.resolve('home.heading', { timeout: 500 });
    await expect(loc).toBeVisible();
    expect(testInfo.annotations.some((a) => a.type === 'healed')).toBe(false);
  });

  test('healing failure throws TF_HEALING_FAILED instead of returning a fake locator', async ({ page, locate }) => {
    await page.setContent('<p>nothing useful</p>');
    await expect(locate.heal('home.missing')).rejects.toMatchObject({ code: 'TF_HEALING_FAILED' });
  });

  test('registry fixture exposes the parsed catalog', async ({ locators }) => {
    expect(locators.get('home.heading')).toMatchObject({ role: 'heading', name: 'Welcome', level: 1 });
  });
});
