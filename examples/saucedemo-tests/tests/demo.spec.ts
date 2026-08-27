import { test, expect } from '@testfly/playwright';

test.describe('TestFly Standart Spec Testleri', () => {
  test('Doğrudan REST API ve DB Entegrasyon Akışı', async ({ api, db, step }) => {
    await step.info('REST API sorgusu başlatılıyor');
    const res = await api.get('https://jsonplaceholder.typicode.com/todos/1');
    expect(res.status).toBe(200);
    expect(res.data.id).toBe(1);

    await step.info('Veritabanı mock tablosuna kayıt ekleniyor');
    const user = await db.users.create({ name: 'TestFly User', role: 'admin' });
    expect(user.id).toBeDefined();
    expect(user.role).toBe('admin');
  });
});
