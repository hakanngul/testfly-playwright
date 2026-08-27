import { test, expect } from '@testfly/playwright';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';

test.describe('SauceDemo UI Doğrudan Playwright TDD Testleri', () => {
  let loginPage: LoginPage;
  let inventoryPage: InventoryPage;
  let cartPage: CartPage;
  let checkoutPage: CheckoutPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    inventoryPage = new InventoryPage(page);
    cartPage = new CartPage(page);
    checkoutPage = new CheckoutPage(page);
    await loginPage.goto();
  });

  test('UI-01: Hatalı şifre ile giriş denendiğinde kullanıcıya hata mesajı gösterilmelidir', async ({ step }) => {
    await step.info('1. Hatalı şifre ile giriş yapılıyor');
    await loginPage.login('standard_user', 'wrong_password');

    await step.info('2. Hata mesajının görüntülendiği doğrulanıyor');
    await loginPage.expectErrorMessage('Username and password do not match any user in this service');
  });

  test('UI-02: Ürün detay sayfasına gidilmeli ve ürün özellikleri doğrulanmalıdır', async ({ page, step }) => {
    await step.info('1. Sisteme giriş yapılıyor');
    await loginPage.login('standard_user', 'secret_sauce');
    await inventoryPage.expectLoaded();

    await step.info('2. "Sauce Labs Backpack" ürününün detayına tıklanıyor');
    await inventoryPage.openProductDetail('Sauce Labs Backpack');

    await step.info('3. Detay sayfasındaki başlık, fiyat ve geri dön butonu doğrulanıyor');
    await expect(inventoryPage.inventoryItemDetailName).toHaveText('Sauce Labs Backpack');
    await expect(inventoryPage.inventoryItemDetailPrice).toHaveText('$29.99');
    await expect(inventoryPage.backToProductsButton).toBeVisible();

    await step.info('4. Ürünler sayfasına geri dönülüyor');
    await inventoryPage.backToProductsButton.click();
    await inventoryPage.expectLoaded();
  });

  test('UI-03: Ürünler alfabetik olarak Z\'den A\'ya ters sıralanabilmelidir', async ({ step }) => {
    await step.info('1. Sisteme giriş yapılıyor');
    await loginPage.login('standard_user', 'secret_sauce');
    await inventoryPage.expectLoaded();

    await step.info('2. Sıralama Z-A olarak seçiliyor');
    await inventoryPage.selectSortOption('za');

    await step.info('3. Ürün isimlerinin ters alfabetik sıralandığı doğrulanıyor');
    const names = await inventoryPage.getItemNames();
    expect(names.length).toBeGreaterThan(0);
    const sortedDesc = [...names].sort().reverse();
    expect(names).toEqual(sortedDesc);
  });

  test('UI-04: Checkout adımında posta kodu boş bırakıldığında validasyon hatası verilmelidir', async ({ step }) => {
    await step.info('1. Sisteme giriş yapılıyor ve ürün sepete ekleniyor');
    await loginPage.login('standard_user', 'secret_sauce');
    await inventoryPage.addItemToCart('Sauce Labs Bike Light');
    await inventoryPage.goToCart();

    await step.info('2. Ödeme sayfasına geçiliyor');
    await cartPage.proceedToCheckout();

    await step.info('3. İsim ve soyisim doldurulup posta kodu boş bırakılıyor');
    await checkoutPage.fillInformation('Mehmet', 'Demir', '');

    await step.info('4. Posta kodu zorunluluğu hatası doğrulanıyor');
    await checkoutPage.expectErrorMessage('Postal Code is required');
  });

  test('UI-05: Sol yan menüden (burger menu) çıkış (logout) yapılabilmelidir', async ({ page, step }) => {
    await step.info('1. Sisteme giriş yapılıyor');
    await loginPage.login('standard_user', 'secret_sauce');
    await inventoryPage.expectLoaded();

    await step.info('2. Yan menü açılıyor ve Çıkış Yap (Logout) seçeneğine tıklanıyor');
    await inventoryPage.logout();

    await step.info('3. Kullanıcının giriş sayfasına yönlendirildiği doğrulanıyor');
    await expect(loginPage.loginButton).toBeVisible();
    expect(page.url()).toBe('https://www.saucedemo.com/');
  });
});
