import { Given, When, Then, expect } from '@testfly/playwright';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';

Given('kullanıcı SauceDemo ana sayfasına gider', async ({ page, step }) => {
  await step.info('SauceDemo ana sayfasına yönlendiriliyor');
  const loginPage = new LoginPage(page);
  await loginPage.goto();
});

When('kullanıcı {string} ve {string} bilgileriyle giriş yapar', async ({ page, step }, username: string, password: string) => {
  await step.info(`Kullanıcı bilgileri giriliyor: ${username}`);
  const loginPage = new LoginPage(page);
  await loginPage.login(username, password);
});

When('kullanıcı giriş butonuna tıklar', async ({ page, step }) => {
  await step.info('Giriş butonuna tıklanıyor');
  const loginPage = new LoginPage(page);
  await loginPage.login();
});

Then('ürünler sayfasının başarıyla yüklendiği doğrulanır', async ({ page, step }) => {
  await step.info('Ürünler sayfasının açıldığı doğrulanıyor');
  const inventoryPage = new InventoryPage(page);
  await inventoryPage.expectLoaded();
});

Then('ekranda {string} hata mesajı görüntülenir', async ({ page, step }, errorText: string) => {
  await step.info(`Hata mesajı doğrulanıyor: ${errorText}`);
  const loginPage = new LoginPage(page);
  await loginPage.expectErrorMessage(errorText);
});

When('kullanıcı ürünleri {string} seçeneği ile sıralar', async ({ page, step }, sortOption: 'az' | 'za' | 'lohi' | 'hilo') => {
  await step.info(`Ürünler ${sortOption} kriterine göre sıralanıyor`);
  const inventoryPage = new InventoryPage(page);
  await inventoryPage.selectSortOption(sortOption);
});

Then('ürün fiyatlarının artan sırada listelendiği doğrulanır', async ({ page, step }) => {
  await step.info('Ürün fiyatlarının küçükten büyüğe sıralandığı kontrol ediliyor');
  const inventoryPage = new InventoryPage(page);
  const prices = await inventoryPage.getItemPrices();
  expect(prices.length).toBeGreaterThan(0);
  const sorted = [...prices].sort((a, b) => a - b);
  expect(prices).toEqual(sorted);
});

When('kullanıcı {string} ürününü sepete ekler', async ({ page, step }, itemName: string) => {
  await step.info(`Ürün sepete ekleniyor: ${itemName}`);
  const inventoryPage = new InventoryPage(page);
  await inventoryPage.addItemToCart(itemName);
});

When('kullanıcı sepet sayfasına gider', async ({ page, step }) => {
  await step.info('Sepet sayfasına yönlendiriliyor');
  const inventoryPage = new InventoryPage(page);
  await inventoryPage.goToCart();
});

When('kullanıcı ödeme adımına ilerler', async ({ page, step }) => {
  await step.info('Ödeme (checkout) adımına geçiliyor');
  const cartPage = new CartPage(page);
  await cartPage.proceedToCheckout();
});

When('kullanıcı müşteri bilgilerini {string}, {string}, {string} olarak girer', async ({ page, step }, firstName: string, lastName: string, postalCode: string) => {
  await step.info(`Müşteri bilgileri giriliyor: ${firstName} ${lastName}`);
  const checkoutPage = new CheckoutPage(page);
  await checkoutPage.fillInformation(firstName, lastName, postalCode);
});

When('kullanıcı siparişi onaylar ve tamamlar', async ({ page, step }) => {
  await step.info('Sipariş özeti kontrol ediliyor ve tamamlanıyor');
  const checkoutPage = new CheckoutPage(page);
  await checkoutPage.verifyOverviewTotals();
  await checkoutPage.finishCheckout();
});

Then('ekranda {string} mesajı doğrulanır', async ({ page, step }, message: string) => {
  await step.info(`Sipariş tamamlama mesajı doğrulanıyor: ${message}`);
  const checkoutPage = new CheckoutPage(page);
  await checkoutPage.expectOrderCompleted();
});

When('kullanıcı {string} ürününü sepetten çıkarır', async ({ page, step }, itemName: string) => {
  await step.info(`Ürün sepetten siliniyor: ${itemName}`);
  const cartPage = new CartPage(page);
  await cartPage.removeItem(itemName);
});

Then('sepetteki ürün sayısının sıfırlandığı doğrulanır', async ({ page, step }) => {
  await step.info('Sepet sayaç rozetinin boş olduğu doğrulanıyor');
  const inventoryPage = new InventoryPage(page);
  await expect(inventoryPage.cartBadge).toHaveCount(0);
});
