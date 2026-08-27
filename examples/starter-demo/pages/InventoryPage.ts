import { Page, Locator, expect } from '@playwright/test';

export class InventoryPage {
  readonly page: Page;
  readonly title: Locator;
  readonly inventoryItems: Locator;
  readonly sortDropdown: Locator;
  readonly cartBadge: Locator;
  readonly cartLink: Locator;
  readonly menuButton: Locator;
  readonly logoutLink: Locator;
  readonly backToProductsButton: Locator;
  readonly inventoryItemDetailName: Locator;
  readonly inventoryItemDetailPrice: Locator;
  readonly inventoryItemDetailDesc: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.locator('[data-test="title"]');
    this.inventoryItems = page.locator('[data-test="inventory-item"]');
    this.sortDropdown = page.locator('[data-test="product-sort-container"]');
    this.cartBadge = page.locator('[data-test="shopping-cart-badge"]');
    this.cartLink = page.locator('[data-test="shopping-cart-link"]');
    this.menuButton = page.locator('#react-burger-menu-btn');
    this.logoutLink = page.locator('#logout_sidebar_link');
    this.backToProductsButton = page.locator('[data-test="back-to-products"]');
    this.inventoryItemDetailName = page.locator('[data-test="inventory-item-name"]');
    this.inventoryItemDetailPrice = page.locator('[data-test="inventory-item-price"]');
    this.inventoryItemDetailDesc = page.locator('[data-test="inventory-item-desc"]');
  }

  async expectLoaded() {
    await expect(this.title).toHaveText('Products');
    await expect(this.inventoryItems.first()).toBeVisible();
  }

  async addItemToCart(itemName: string) {
    const item = this.page.locator('[data-test="inventory-item"]').filter({ hasText: itemName });
    await item.locator('button').click();
  }

  async selectSortOption(value: 'az' | 'za' | 'lohi' | 'hilo') {
    await this.sortDropdown.selectOption(value);
  }

  async getItemPrices(): Promise<number[]> {
    const priceElements = this.page.locator('[data-test="inventory-item-price"]');
    const count = await priceElements.count();
    const prices: number[] = [];
    for (let i = 0; i < count; i++) {
      const text = await priceElements.nth(i).innerText();
      prices.push(parseFloat(text.replace('$', '')));
    }
    return prices;
  }

  async getItemNames(): Promise<string[]> {
    const nameElements = this.page.locator('[data-test="inventory-item-name"]');
    return await nameElements.allInnerTexts();
  }

  async openProductDetail(itemName: string) {
    await this.page.locator('[data-test="inventory-item-name"]').filter({ hasText: itemName }).click();
  }

  async goToCart() {
    await this.cartLink.click();
  }

  async logout() {
    await this.menuButton.click();
    await this.logoutLink.click();
  }
}
