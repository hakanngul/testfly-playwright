import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { FormClient } from '../../src/quality/form';
import { launchChromium } from '../helpers/browser';

let browser: Browser;
let page: Page;

const HTML = `<form>
  <label for="email">Email</label><input id="email" name="email_field">
  <input placeholder="Nickname">
  <input name="city">
  <input id="zip">
  <input data-testid="token">
  <label><input type="checkbox" id="terms"> Accept terms</label>
  <div id="scoped"><label>Email <input id="scoped-email"></label></div>
</form>`;

beforeAll(async () => {
  browser = await launchChromium();
  page = await browser.newPage();
});
afterAll(async () => {
  await browser?.close();
});

describe('FormClient', () => {
  it('fills fields by label, placeholder, name, id and test id', async () => {
    await page.setContent(HTML);
    await new FormClient(page).fill({ Email: 'a@b.c', Nickname: 'neo', city: 'Berlin', zip: '10115', token: 'xyz' });
    expect(await page.inputValue('#email')).toBe('a@b.c');
    expect(await page.inputValue('[placeholder=Nickname]')).toBe('neo');
    expect(await page.inputValue('[name=city]')).toBe('Berlin');
    expect(await page.inputValue('#zip')).toBe('10115');
    expect(await page.inputValue('[data-testid=token]')).toBe('xyz');
  });

  it('checks and unchecks booleans, stringifies numbers', async () => {
    await page.setContent(HTML);
    const form = new FormClient(page);
    await form.fill({ terms: true, zip: 12345 });
    expect(await page.isChecked('#terms')).toBe(true);
    expect(await page.inputValue('#zip')).toBe('12345');
    await form.fill({ terms: false });
    expect(await page.isChecked('#terms')).toBe(false);
  });

  it('can be scoped to a root locator', async () => {
    await page.setContent(HTML);
    await new FormClient(page).fill({ Email: 'scoped@x.io' }, page.locator('#scoped'));
    expect(await page.inputValue('#scoped-email')).toBe('scoped@x.io');
    expect(await page.inputValue('#email')).toBe('');
  });

  it('escapes quotes in field names', async () => {
    await page.setContent('<input name=\'we"ird\'>');
    await new FormClient(page).fill({ 'we"ird': 'ok' });
    expect(await page.inputValue('input')).toBe('ok');
  });

  it('fails loudly (Playwright timeout) when a field does not exist', async () => {
    await page.setContent(HTML);
    page.setDefaultTimeout(500);
    await expect(new FormClient(page).fill({ doesNotExist: 'x' })).rejects.toThrow(/Timeout/);
    page.setDefaultTimeout(30_000);
  });
});
