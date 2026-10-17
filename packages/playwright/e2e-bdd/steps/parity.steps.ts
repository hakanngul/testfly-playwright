import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AfterAll, BeforeAll, Given, Then, When, expect } from '@testfly/playwright/bdd';

// ---------------------------------------------------------------- local API

let server: Server | undefined;
let apiUrl = '';
const USER = { id: 7, name: 'Ada', roles: ['admin', 'qa'], profile: { lang: 'tr', tz: 'Europe/Istanbul' } };

BeforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(req.url === '/me' ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(req.url === '/me' ? JSON.stringify(USER) : '{}');
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

AfterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

// ---------------------------------------------------------------- form & page matchers

const FORM = `
  <form>
    <label>Email <input id="email" type="email" required maxlength="40"></label>
    <label>Password <input id="pw" type="password" value="s3cret"></label>
    <button type="button" onclick="document.getElementById('pw').type='text'">Show password</button>
    <label>Country <select id="country"><option>Türkiye</option><option>Germany</option></select></label>
  </form>`;

Given('a sign-up form with an email, a password and a country select', async ({ page }) => {
  await page.setContent(FORM);
});

When('the user types {string} into the email field', async ({ page }, value: string) => {
  await page.getByLabel('Email').fill(value);
});

Then('the email field is invalid with a validation message', async ({ page }) => {
  await expect(page.getByLabel('Email')).toBeInvalid();
  await expect(page.getByLabel('Email')).toHaveValidationMessage(/.+/);
});

Then('the email field is valid', async ({ page }) => {
  await expect(page.getByLabel('Email')).toBeValid();
});

Then('the email field is required with a max length of {int}', async ({ page }, max: number) => {
  await expect(page.getByLabel('Email')).toBeRequired();
  await expect(page.getByLabel('Email')).toHaveMaxLength(max);
});

Then('the password is hidden', async ({ page }) => {
  await expect(page.getByLabel('Password')).toBePasswordHidden();
});

When('the user clicks {string}', async ({ page }, name: string) => {
  await page.getByRole('button', { name }).click();
});

Then('the password is visible', async ({ page }) => {
  await expect(page.getByLabel('Password')).toBePasswordVisible();
});

When('the user selects {string} as country', async ({ page }, label: string) => {
  await page.getByLabel('Country').selectOption({ label });
});

Then('the selected country is {string}', async ({ page }, label: string) => {
  await expect(page.getByLabel('Country')).toHaveSelectedOption(label);
});

Then('the form has at least {int} and at most {int} inputs', async ({ page }, min: number, max: number) => {
  const fields = page.locator('input, select');
  await expect(fields).toHaveCountAtLeast(min);
  await expect(fields).toHaveCountAtMost(max);
});

When('the page stores {string} = {string} in localStorage', async ({ page }, key: string, value: string) => {
  await page.goto(`${apiUrl}/me`);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
});

Then('localStorage item {string} is {string}', async ({ page }, key: string, value: string) => {
  await expect(page).toHaveLocalStorageItem(key, value);
});

Then('the page has {int} open window(s)', async ({ page }, count: number) => {
  await expect(page).toHaveWindowCount(count);
});

// ---------------------------------------------------------------- console errors

When('a page logs {string} with console.error and throws {string}', async ({ page }, logged: string, thrown: string) => {
  await page.setContent(`<script>console.error(${JSON.stringify(logged)}); setTimeout(() => { throw new Error(${JSON.stringify(thrown)}); }, 0);</script>`);
});

Then('{int} browser errors are recorded', async ({ consoleErrors }, count: number) => {
  await expect.poll(() => consoleErrors.list().length).toBe(count);
});

Then('one of them is the uncaught exception {string}', async ({ consoleErrors }, message: string) => {
  const pageErrors = consoleErrors.list().filter((e) => e.type === 'pageerror');
  expect(pageErrors.map((e) => e.message).join('\n')).toContain(message);
});

When('the recorded browser errors are cleared', async ({ consoleErrors }) => {
  await expect.poll(() => consoleErrors.list().length).toBe(2);
  consoleErrors.clear();
});

Then('no browser errors are recorded', async ({ consoleErrors }) => {
  consoleErrors.expectNone();
});

// ---------------------------------------------------------------- API JSON helpers

Given('a local API that returns the current user', async ({ ctx }) => {
  ctx.set('apiUrl', apiUrl);
});

When('the client requests {string}', async ({ api, ctx }, path: string) => {
  ctx.set('response', await api.get(`${ctx.require<string>('apiUrl')}${path}`));
});

Then('the status is between {int} and {int}', async ({ ctx }, from: number, to: number) => {
  ctx.require<import('@testfly/playwright').ApiResponse>('response').expectStatusRange(from, to);
});

Then('the body equals the expected user ignoring array order', async ({ ctx }) => {
  ctx.require<import('@testfly/playwright').ApiResponse>('response').expectJsonEquals(
    { profile: { tz: 'Europe/Istanbul', lang: 'tr' }, roles: ['qa', 'admin'], name: 'Ada', id: 7 },
    { ignoreArrayOrder: true },
  );
});

Then('the {string} array contains {string}', async ({ ctx }, path: string, value: string) => {
  ctx.require<import('@testfly/playwright').ApiResponse>('response').expectJsonArrayContains(path, value);
});

Then('comparing the body with a user named {string} fails at {string}', async ({ ctx }, name: string, path: string) => {
  const res = ctx.require<import('@testfly/playwright').ApiResponse>('response');
  expect(() => res.expectJsonEquals({ ...res.data, name })).toThrow(`first difference: ${path}`);
});
