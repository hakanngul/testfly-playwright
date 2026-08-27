import { test, expect } from '@testfly/playwright';

test.describe('TestFly Enterprise Standart Spec Testleri', () => {
  test('1. Doğrudan REST API ve DB Entegrasyon Akışı', async ({ api, db, step }) => {
    await step.info('REST API sorgusu başlatılıyor');
    const res = await api.get('https://jsonplaceholder.typicode.com/todos/1');
    expect(res.status).toBe(200);
    expect(res.data.id).toBe(1);

    await step.info('Veritabanı tablosuna kayıt ekleniyor');
    const user = await db.users.create({ name: 'TestFly User', role: 'admin' });
    expect(user.id).toBeDefined();
    expect(user.role).toBe('admin');
  });

  test('2. Redis & Cache Fixture Akışı', async ({ db, step }) => {
    await step.info('Redis önbelleğine oturum tokeni yazılıyor');
    await db.redis.set('user:session:99', { token: 'jwt-xyz', active: true });

    await step.info('Redis anahtar varlığı ve içeriği doğrulanıyor');
    await db.redis.assertExists('user:session:99');
    await db.redis.assertValue('user:session:99', { token: 'jwt-xyz', active: true });
  });

  test('3. Smart Network & API Route Mocking Akışı', async ({ page, mock, step }) => {
    await step.info('Özel bir API rotası mocklanıyor');
    await mock.json('**/api/v1/custom-endpoint', {
      success: true,
      message: 'TestFly Mock Response',
    });

    await step.info('Sayfadan mocklanan rotaya istek atılıyor');
    await page.goto('https://demo.playwright.dev/todomvc');
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/v1/custom-endpoint');
      return await res.json();
    });

    expect(response.success).toBe(true);
    expect(response.message).toBe('TestFly Mock Response');

    const history = mock.getHistory('custom-endpoint');
    expect(history.length).toBeGreaterThan(0);
  });

  test('4. Accessibility (A11y) Denetim Akışı', async ({ page, a11y, step }) => {
    await step.info('Sayfa yükleniyor ve erişilebilirlik taraması yapılıyor');
    await page.goto('https://demo.playwright.dev/todomvc');

    const results = await a11y.analyze();
    expect(results).toBeDefined();
    expect(results.passes.length).toBeGreaterThan(0);
  });
});

