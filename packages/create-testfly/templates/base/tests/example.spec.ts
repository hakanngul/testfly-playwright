import { test, expect } from '@testfly/playwright';

test('add and complete a todo', { tag: '@smoke' }, async ({ page, locate, step }) => {
  await page.goto('/');

  await step('Add a todo', async () => {
    await locate('todo.new_todo').fill('Buy milk');
    await locate('todo.new_todo').press('Enter');
  });

  await expect(locate('todo.items')).toHaveText('Buy milk');
  await page.getByRole('checkbox', { name: 'Toggle Todo' }).check();
  await expect(page.locator('.todo-list li')).toHaveClass('completed');
});
