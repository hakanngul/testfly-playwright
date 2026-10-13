import './fake-setup';
import { test as plainTest, expect as plainExpect } from '@playwright/test';
import { aiMatchers, expect, test } from '../../src';

const HTML = `<h1>Cart</h1><button>Go</button><section id="s"><p>2 items</p></section>`;

test('page toSatisfyAi passes', async ({ page }) => {
  await page.setContent(HTML);
  await expect(page).toSatisfyAi('the cart shows 2 items');
});

test('page toViolateAi passes when the model says violated', async ({ page }) => {
  await page.setContent(HTML);
  await expect(page).toViolateAi('page FAILME');
});

test('locator scope is sent to the model', async ({ page }) => {
  await page.setContent(HTML);
  await expect(page.locator('#s')).toSatisfyAi('shows items');
});

test('failing toSatisfyAi message contains the reason', async ({ page }) => {
  await page.setContent(HTML);
  const err = await expect(page).toSatisfyAi('FAILME please').then(
    () => undefined,
    (e: Error) => e,
  );
  if (!err) throw new Error('expected rejection');
  if (!/Expected page to satisfy: "FAILME please"/.test(err.message) || !/AI verdict: fake-reason-bad/.test(err.message)) throw new Error(`bad message: ${err.message}`);
});

test('failing toViolateAi on locator message', async ({ page }) => {
  await page.setContent(HTML);
  const err = await expect(page.locator('#s')).toViolateAi('fine').then(
    () => undefined,
    (e: Error) => e,
  );
  if (!err) throw new Error('expected rejection');
  if (!/Expected locator to violate: "fine"/.test(err.message) || !/fake-reason-good/.test(err.message)) throw new Error(`bad message: ${err.message}`);
});

test('.not variants', async ({ page }) => {
  await page.setContent(HTML);
  await expect(page).not.toSatisfyAi('FAILME');
  await expect(page).not.toViolateAi('fine');
  const err = await expect(page).not.toSatisfyAi('fine').then(
    () => undefined,
    (e: Error) => e,
  );
  if (!err || !/not to satisfy/.test(err.message)) throw new Error('bad .not message');
});

test('expect.soft records but does not stop', async ({ page }) => {
  await page.setContent(HTML);
  await expect.soft(page).toSatisfyAi('FAILME soft');
  await expect(page).toSatisfyAi('after soft');
});

test('ai fixture: act + byIntent + assert', async ({ page, ai }) => {
  await page.setContent(`<button onclick="document.title='clicked'">Go</button>`);
  await ai.act('press the go button');
  if ((await page.title()) !== 'clicked') throw new Error('act did not click');
  const loc = await ai.byIntent('go button');
  if ((await loc.count()) !== 1) throw new Error('byIntent');
  await ai.assert('the page is fine');
});

// Without the TestFly AI fixtures (plain @playwright/test `test`) the matchers have no runtime.
const bareExpect = plainExpect.extend(aiMatchers);
plainTest('no runtime -> TF_AI_NOT_CONFIGURED', async ({ page }) => {
  await page.setContent(HTML);
  const err = await bareExpect(page).toSatisfyAi('x').then(
    () => undefined,
    (e: Error & { code?: string }) => e,
  );
  if (!err || (err as { code?: string }).code !== 'TF_AI_NOT_CONFIGURED') throw new Error(`unexpected: ${String(err)}`);
});
