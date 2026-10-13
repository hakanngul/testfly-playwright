import { expect, test } from './support/test';

// Listed in testfly-quarantine.yml: these bodies must never run.
test('quarantined by title', async () => {
  throw new Error('this test is quarantined and must have been skipped');
});

test('quarantined by tag', { tag: '@qtag' }, async () => {
  throw new Error('this test is quarantined by tag and must have been skipped');
});

test('not quarantined runs normally', async ({ page }) => {
  await page.setContent('<p>ok</p>');
  await expect(page.locator('p')).toHaveText('ok');
});
