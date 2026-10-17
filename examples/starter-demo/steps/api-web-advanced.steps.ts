import { Given, When, Then, expect } from '@testfly/playwright/bdd';

let lastApiResponse: any = null;
let loadedUsers: any[] = [];

When('{string} adresine GraphQL sorgusu gönderilir:', async ({ api, step }, url: string, query: string) => {
  await step.info(`GraphQL sorgusu gönderiliyor: ${url}`);
  lastApiResponse = await api.graphql(query, undefined, { endpoint: url });
});

Then('API yanıt süresi {int} ms altında olmalıdır', async ({ step }, maxDuration: number) => {
  await step.info(`API yanıt süresi: ${lastApiResponse.durationMs} ms`);
  expect(lastApiResponse.durationMs).toBeLessThan(maxDuration);
});

Then('GraphQL yanıtında ülke adı {string} olmalıdır', async ({ step }, expectedCountry: string) => {
  const countryName = lastApiResponse.data?.data?.country?.name;
  await step.info(`Gelen ülke adı: ${countryName}`);
  expect(countryName).toBe(expectedCountry);
});

Then('API istek ve yanıt detayları otomatik rapora eklenmiş olmalıdır', async ({ step }) => {
  expect(lastApiResponse.durationMs).toBeGreaterThanOrEqual(0);
  expect(lastApiResponse.status).toBe(200);
});

Given('{string} dosyasından test verisi yüklenir', async ({ ctx, step }, filePath: string) => {
  await step.info(`Veri dosyası yükleniyor: ${filePath}`);
  loadedUsers = ctx.loadJson<any[]>(filePath);
  expect(loadedUsers.length).toBeGreaterThan(0);
});

When('ilk veri satırındaki kullanıcı için sorgu yapılır', async ({ step }) => {
  const user = loadedUsers[0];
  await step.info(`Kullanıcı: ${user.name}`);
  expect(user.id).toBe(1);
});

Then('kullanıcı verisinin doğruluğu onaylanır', async () => {
  expect(loadedUsers[0].email).toBe('john@mail.com');
});

Given('kullanıcı kayıt formunu açar', async ({ page }) => {
  await page.setContent(`
    <form id="signup-form" onsubmit="return false;">
      <label for="username">username</label>
      <input id="username" name="username" type="text" />
      <label for="email">email</label>
      <input id="email" name="email" type="email" />
      <button class="primary-btn fallback-btn" type="button">Submit</button>
    </form>
  `);
});

When('akıllı form yardımcısı ile alanlar tek seferde doldurulur:', async ({ form, step }, dataTable: any) => {
  await step.info('Akıllı form dolduruluyor');
  const rows = dataTable.rowsHash();
  await form.fill(rows);
});

When('kırık birincil seçici tanımlı {string} listesi üzerinden kurtarılır', async ({ locators, locate, step }, _type: string) => {
  await step.info('Self-healing fallback ile buton çözümleniyor');
  // Kırık birincil (#broken-submit-btn) yerine fallback (.fallback-btn) çözümlenir
  locators.register('form.submit_button', {
    css: '#broken-submit-btn',
    fallbacks: [{ css: '.fallback-btn' }],
  });

  const button = locate('form.submit_button');
  await button.click();
});

Then('form başarıyla gönderilir', async ({ page }) => {
  expect(await page.locator('#username').inputValue()).toBe('testuser');
  expect(await page.locator('#email').inputValue()).toBe('test@testfly.dev');
});
