import { expect, test } from './support/test';

const FORM = `
  <form>
    <input id="email" type="email" required maxlength="40" value="not-an-email">
    <input id="name" required>
    <input id="ok" value="fine">
    <input id="ro" readonly value="locked">
    <div id="aria" role="textbox" aria-required="true" aria-readonly="true"></div>
    <input id="pw" type="password" value="s3cret">
    <button type="button" id="show" onclick="document.getElementById('pw').type='text'">show</button>
    <select id="country"><option value="tr">Türkiye</option><option value="de" selected>Germany</option></select>
  </form>
  <ul><li>a</li><li>b</li><li>c</li></ul>`;

test.describe('form matchers', () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(FORM);
  });

  test('validity, required, read-only and maxlength', async ({ page }) => {
    await expect(page.locator('#email')).toBeInvalid();
    await expect(page.locator('#ok')).toBeValid();
    await expect(page.locator('#ok')).not.toBeInvalid();
    await expect(page.locator('#name')).toBeRequired();
    await expect(page.locator('#aria')).toBeRequired();
    await expect(page.locator('#ok')).not.toBeRequired();
    await expect(page.locator('#ro')).toBeReadOnly();
    await expect(page.locator('#aria')).toBeReadOnly();
    await expect(page.locator('#email')).toHaveMaxLength(40);
  });

  test('validation message matches the browser text', async ({ page }) => {
    await expect(page.locator('#name')).toHaveValidationMessage(/.+/);
    await expect(page.locator('#ok')).toHaveValidationMessage('');
  });

  test('password visibility follows the show toggle', async ({ page }) => {
    await expect(page.locator('#pw')).toBePasswordHidden();
    await page.locator('#show').click();
    await expect(page.locator('#pw')).toBePasswordVisible();
  });

  test('selected option label', async ({ page }) => {
    await expect(page.locator('#country')).toHaveSelectedOption('Germany');
    await page.locator('#country').selectOption('tr');
    await expect(page.locator('#country')).toHaveSelectedOption(/Türk/);
  });

  test('count bounds wait for late elements', async ({ page }) => {
    await expect(page.locator('li')).toHaveCountAtLeast(3);
    await expect(page.locator('li')).toHaveCountAtMost(3);
    await page.evaluate(() => setTimeout(() => document.querySelector('ul')!.append(document.createElement('li')), 300));
    await expect(page.locator('li')).toHaveCountAtLeast(4);
    await expect(page.locator('li')).not.toHaveCountAtMost(3);
  });

  test('a failing matcher reports expectation and received value', async ({ page }) => {
    const err = await expect(page.locator('#ok')).toBeRequired({ timeout: 300 }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('to be required');
  });
});

test.describe('page matchers', () => {
  test('cookie, localStorage and window count', async ({ page, server }) => {
    await page.goto(`${server}/page`);
    await page.context().addCookies([{ name: 'session', value: 'abc123', url: server }]);
    await expect(page).toHaveCookie('session');
    await expect(page).toHaveCookie('session', /^abc/);
    await expect(page).not.toHaveCookie('missing', undefined, { timeout: 300 });

    await page.evaluate(() => setTimeout(() => localStorage.setItem('theme', 'dark'), 200));
    await expect(page).toHaveLocalStorageItem('theme', 'dark');
    await expect(page).not.toHaveLocalStorageItem('nope', undefined, { timeout: 300 });

    await expect(page).toHaveWindowCount(1);
    const popup = await page.context().newPage();
    await expect(page).toHaveWindowCount(2);
    await popup.close();
    await expect(page).toHaveWindowCount(1);
  });
});
