import { Given, When, Then, expect } from '@testfly/playwright';

Given('the user navigates to the login page', async ({ page }) => {
  await page.goto('/');
});

When('the user enters username {string} and password {string}', async ({ locate }, username: string, password: string) => {
  // 100% Compile-time Type-Safe with IDE Autocomplete
  await locate('login.username_field').fill(username);
  await locate('login.password_field').fill(password);
});

When('clicks the login button', async ({ locate }) => {
  await locate('login.login_button').click();
});

Then('the product catalog title should be {string}', async ({ locate }, expectedTitle: string) => {
  await expect(locate('products.title')).toHaveText(expectedTitle);
});

Then('at least 1 product item should be displayed', async ({ locate }) => {
  const items = locate('products.inventory_item');
  await expect(items.first()).toBeVisible();
});
