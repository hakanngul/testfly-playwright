import './fake-setup';
import { expect, test } from '../../src';

test('deliberately failing test', async ({ page }) => {
  await page.setContent('<button>Go</button>');
  await expect(page.getByRole('button', { name: 'Nope' })).toBeVisible({ timeout: 500 });
});
