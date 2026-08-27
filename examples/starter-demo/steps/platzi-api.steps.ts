import { When, Then, expect } from '@testfly/playwright';
import { ApiResponse } from '@testfly/playwright';

let lastApiResponse: ApiResponse<any>;
let createdProductId: number;
let jwtToken: string;

When('Platzi API üzerinden tüm ürünler listesi istenir', async ({ api, step }) => {
  await step.info('GET /api/v1/products isteği gönderiliyor');
  lastApiResponse = await api.get('/api/v1/products');
});

Then('API yanıt durum kodu {int} olmalıdır', async ({ step }, statusCode: number) => {
  await step.info(`Durum kodu kontrol ediliyor: beklenen ${statusCode}`);
  expect(lastApiResponse.status).toBe(statusCode);
});

Then('gelen yanıtın ürün dizisi olduğu ve zorunlu alanları içerdiği doğrulanır', async ({ step }) => {
  await step.info('Ürün listesi şeması ve zorunlu alanlar doğrulanıyor');
  expect(Array.isArray(lastApiResponse.data)).toBe(true);
  expect(lastApiResponse.data.length).toBeGreaterThan(0);
  const firstProduct = lastApiResponse.data[0];
  expect(firstProduct).toHaveProperty('id');
  expect(firstProduct).toHaveProperty('title');
  expect(firstProduct).toHaveProperty('price');
  expect(firstProduct).toHaveProperty('category');
});

When('Platzi API\'den {string} adet ürün için {string} ile {string} fiyat aralığında filtreleme yapılır', async ({ api, step }, limit: string, priceMin: string, priceMax: string) => {
  await step.info(`Filtreli ürün listesi isteniyor: limit=${limit}, price_min=${priceMin}, price_max=${priceMax}`);
  lastApiResponse = await api.get('/api/v1/products', {
    params: {
      offset: 0,
      limit: parseInt(limit, 10),
      price_min: parseInt(priceMin, 10),
      price_max: parseInt(priceMax, 10),
    },
  });
});

Then('dönen ürün sayısının en fazla {string} olduğu ve fiyatların limitler dahilinde olduğu doğrulanır', async ({ step }, maxLimit: string) => {
  await step.info('Filtreleme kriterleri doğrulanıyor');
  expect(Array.isArray(lastApiResponse.data)).toBe(true);
  expect(lastApiResponse.data.length).toBeLessThanOrEqual(parseInt(maxLimit, 10));
  for (const item of lastApiResponse.data) {
    expect(item.price).toBeGreaterThanOrEqual(20);
    expect(item.price).toBeLessThanOrEqual(100);
  }
});

When('Platzi API\'ye yeni bir ürün oluşturma isteği gönderilir', async ({ api, step }) => {
  await step.info('POST /api/v1/products ile yeni ürün oluşturuluyor');
  const payload = {
    title: `TestFly Automation Test Product ${Date.now()}`,
    price: 99,
    description: 'A test product created via TestFly Playwright framework',
    categoryId: 1,
    images: ['https://placeimg.com/640/480/any'],
  };
  lastApiResponse = await api.post('/api/v1/products', { data: payload });
  if (lastApiResponse.data?.id) {
    createdProductId = lastApiResponse.data.id;
  }
});

Then('oluşturulan ürünün id ve başlık bilgisi doğrulanır', async ({ step }) => {
  await step.info('Oluşturulan ürün doğrulanıyor');
  expect(lastApiResponse.data.id).toBeDefined();
  expect(lastApiResponse.data.title).toContain('TestFly Automation Test Product');
  expect(lastApiResponse.data.price).toBe(99);
});

When('kullanıcı {string} ve {string} bilgileriyle API üzerinden giriş yapar', async ({ api, step }, email: string, password: string) => {
  await step.info(`POST /api/v1/auth/login ile giriş yapılıyor: ${email}`);
  lastApiResponse = await api.post('/api/v1/auth/login', {
    data: { email, password },
  });
  if (lastApiResponse.data?.access_token) {
    jwtToken = lastApiResponse.data.access_token;
  }
});

Then('API yanıtında geçerli bir JWT access_token dönmelidir', async ({ step }) => {
  await step.info('JWT token doğrulanıyor');
  expect(lastApiResponse.data.access_token).toBeDefined();
  expect(typeof lastApiResponse.data.access_token).toBe('string');
});

Then('bu token ile kullanıcı profili çekildiğinde e-posta adresi {string} olmalıdır', async ({ api, step }, expectedEmail: string) => {
  await step.info('Bearer token ile GET /api/v1/auth/profile sorgulanıyor');
  const profileRes = await api.get('/api/v1/auth/profile', {
    headers: {
      Authorization: `Bearer ${jwtToken}`,
    },
  });
  expect(profileRes.status).toBe(200);
  expect(profileRes.data.email).toBe(expectedEmail);
});
