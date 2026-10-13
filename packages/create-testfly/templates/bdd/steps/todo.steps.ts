import { Given, When, Then, expect } from '@testfly/playwright/bdd';

Given('I open the todo app', async ({ page }) => {
  await page.goto('/');
});

When('I add the todo {string}', async ({ locate, step }, title: string) => {
  await step(`Add "${title}"`, async () => {
    const input = locate('todo.new_todo');
    await input.fill(title);
    await input.press('Enter');
  });
});

Then('the todo list shows {string}', async ({ locate }, title: string) => {
  await expect(locate('todo.items')).toHaveText(title);
});
