import { test, expect } from '@testfly/playwright';

test.describe('YAML Locator TypeGen Spec Tests', () => {
  test('should login using strongly typed locate fixture', async ({ page, locate }) => {
    await page.goto('/');

    await locate('login.username_field').fill('standard_user');
    await locate('login.password_field').fill('secret_sauce');
    await locate('login.login_button').click();

    await expect(locate('products.title')).toHaveText('Products');
  });
});
