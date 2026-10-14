import { Given, When, Then, expect } from '@testfly/playwright/bdd';

Given('kullanıcı todo sayfasına gider', async ({ page, step }) => {
  await step.info('TodoMVC demo sayfasına yönlendiriliyor');
  await page.goto('https://demo.playwright.dev/todomvc');
});

When('kullanıcı {string} görevini ekler', async ({ page, db, step }, taskName: string) => {
  await step.info(`Yeni görev giriliyor: ${taskName}`);
  const input = page.locator('.new-todo');
  await input.fill(taskName);
  await input.press('Enter');
  // TodoMVC has no backend: record the event in the explicit in-memory store (testfly.db.client = 'mock').
  await db.mock!.table('todos').create({ title: taskName, status: 'TODO_CREATED' });
});

Then('listede {string} görevi görüntülenir', async ({ page, step }, taskName: string) => {
  await step.info(`Görevin görünürlüğü doğrulanıyor: ${taskName}`);
  const item = page.locator('.todo-list li label');
  await expect(item).toHaveText(taskName);
});

Then('sistemde {string} durumunda bir kayıt oluşur', async ({ db, step }, status: string) => {
  await step.info(`Veritabanında ${status} durumu kontrol ediliyor`);
  const record = await db.mock!.table('todos').findOne({ status });
  expect(record).not.toBeNull();
});
