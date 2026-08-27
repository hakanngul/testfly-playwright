import { test, expect } from '@testfly/playwright';

test.describe('Platzi Fake Store REST API Doğrudan Playwright TDD Testleri', () => {

  test('API-01: GET /api/v1/products/:id tekil ürün detayını başarıyla getirmelidir', async ({ api, step }) => {
    await step.info('1. Mevcut ürünler listesinden ilk ürün ID alınıyor veya yeni ürün oluşturuluyor');
    const listRes = await api.get('/api/v1/products?limit=1');
    let targetId = listRes.data?.[0]?.id;
    if (!targetId) {
      const createRes = await api.post('/api/v1/products', {
        data: {
          title: 'TDD Testfly Special Item',
          price: 150,
          description: 'Product created for direct spec testing',
          categoryId: 1,
          images: ['https://placeimg.com/640/480/tech'],
        },
      });
      targetId = createRes.data?.id;
    }

    await step.info(`2. Ürün ID: ${targetId} için GET isteği gönderiliyor`);
    const response = await api.get(`/api/v1/products/${targetId}`);

    await step.info('3. Yanıt durum kodu ve ürün özellikleri doğrulanıyor');
    expect(response.status).toBe(200);
    expect(response.data.id).toBe(targetId);
    expect(response.data).toHaveProperty('title');
    expect(response.data).toHaveProperty('price');
    expect(response.data).toHaveProperty('category');
  });

  test('API-02: GET /api/v1/products/9999999 bulunamayan ürün için 400/404 hatası vermelidir', async ({ api, step }) => {
    await step.info('1. Var olmayan ürün ID için GET isteği yapılıyor');
    const response = await api.get('/api/v1/products/9999999');

    await step.info('2. Hata durum kodu (400 veya 404) doğrulanıyor');
    expect([400, 404]).toContain(response.status);
  });

  test('API-03: PUT /api/v1/categories/:id mevcut kategoriyi başarıyla güncellemelidir', async ({ api, step }) => {
    await step.info('1. Kategori güncelleme isteği gönderiliyor');
    const updatePayload = {
      name: `TDD Testfly Category ${Date.now()}`,
    };
    const response = await api.put('/api/v1/categories/1', {
      data: updatePayload,
    });

    await step.info('2. Güncellenen kategorinin yeni değerleri doğrulanıyor');
    expect(response.status).toBe(200);
    expect(response.data.name).toContain('TDD Testfly Category');
  });

  test('API-04: DELETE /api/v1/products/:id ürünü başarıyla silmelidir', async ({ api, step }) => {
    await step.info('1. Geçici bir ürün oluşturuluyor');
    const tempRes = await api.post('/api/v1/products', {
      data: {
        title: `Item to be deleted ${Date.now()}`,
        price: 50,
        description: 'To be removed',
        categoryId: 1,
        images: ['https://placeimg.com/640/480/tech'],
      },
    });
    const tempId = tempRes.data.id;

    await step.info(`2. Oluşturulan ürün (ID: ${tempId}) siliniyor`);
    const deleteRes = await api.delete(`/api/v1/products/${tempId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.data).toBe(true);
  });

  test('API-05: POST /api/v1/auth/login geçersiz bilgilerle 401 Unauthorized dönmelidir', async ({ api, step }) => {
    await step.info('1. Hatalı e-posta ve şifre ile login isteği gönderiliyor');
    const response = await api.post('/api/v1/auth/login', {
      data: {
        email: 'nonexistent_user_testfly@example.com',
        password: 'invalid_password_123',
      },
    });

    await step.info('2. 401 Unauthorized durum kodu ve hata yanıtı doğrulanıyor');
    expect(response.status).toBe(401);
  });
});
