import { expect, test } from './support/test';

test.describe('a11y', () => {
  test('passes on an accessible page', async ({ page, a11y }) => {
    await page.setContent('<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>Hi</h1></main></body></html>');
    await a11y.assertNoViolations();
  });

  test('fails with TF_QUALITY_ASSERTION_FAILED and attaches violations', async ({ page, a11y }, testInfo) => {
    await page.setContent('<!doctype html><html lang="en"><head><title>t</title></head><body><main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></main></body></html>');
    await expect(a11y.assertNoViolations()).rejects.toMatchObject({ code: 'TF_QUALITY_ASSERTION_FAILED' });
    expect(testInfo.attachments.some((a) => a.name === 'a11y-violations')).toBe(true);
  });
});

test.describe('perf', () => {
  test('measures real vitals of a served page', async ({ page, perf, server }) => {
    await page.goto(`${server}/page`);
    await perf.assertTtfb(5000);
    const vitals = await perf.getVitals();
    expect(vitals.ttfb).not.toBeNull();
  });
});

test.describe('form', () => {
  test('fills by label, placeholder and name', async ({ page, form }) => {
    await page.setContent('<label>Email <input id="e"></label><input placeholder="Nick" id="n"><input name="zip" id="z"><input type="checkbox" id="c" aria-label="terms">');
    await form.fill({ Email: 'a@b.c', Nick: 'neo', zip: '10115', terms: true });
    await expect(page.locator('#e')).toHaveValue('a@b.c');
    await expect(page.locator('#n')).toHaveValue('neo');
    await expect(page.locator('#z')).toHaveValue('10115');
    await expect(page.locator('#c')).toBeChecked();
  });
});

test.describe('mock', () => {
  test('mocks a network call made by the page and records history', async ({ page, mock, server }) => {
    await mock.json('**/json', { hello: 'mocked' });
    await page.goto(`${server}/fetches`);
    await expect(page.locator('body')).toHaveText('live:mocked');
    expect(mock.getHistory('/json').length).toBeGreaterThan(0);
  });

  test('routes are reset after each test (real server answers again)', async ({ page, server }) => {
    await page.goto(`${server}/fetches`);
    await expect(page.locator('body')).toHaveText('live:world');
  });
});

test.describe('visual', () => {
  const box = (color: string): string => `<style>body{margin:0}#b{width:80px;height:40px;background:${color}}</style><div id="b"></div>`;

  test('element snapshot matches the baseline', async ({ page, visual }) => {
    await page.setContent(box('rgb(200, 30, 30)'));
    await visual.assertElementSnapshot('#b', 'red-box');
  });

  test('a different rendering fails the comparison', async ({ page, visual }) => {
    await page.setContent(box('rgb(30, 30, 200)'));
    await expect(visual.assertElementSnapshot('#b', 'red-box')).rejects.toThrow();
  });

  test('page snapshot with a masked region', async ({ page, visual }) => {
    await page.setContent('<style>body{margin:0;background:white}</style><div style="width:100px;height:50px;background:rgb(10,160,10)"></div><div id="dyn" style="width:100px;height:20px;background:' + 'rgb(' + '0,0,0)"></div>');
    await visual.assertSnapshot('masked', { mask: ['#dyn'], clip: { x: 0, y: 0, width: 100, height: 80 } });
  });
});
