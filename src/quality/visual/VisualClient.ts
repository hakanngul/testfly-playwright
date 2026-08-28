import { Page, Locator, expect } from '@playwright/test';

export interface VisualSnapshotOptions {
  mask?: (Locator | string)[];
  maxDiffPixels?: number;
  maxDiffPixelRatio?: number;
  threshold?: number;
  fullPage?: boolean;
  animations?: 'disabled' | 'allow';
  clip?: { x: number; y: number; width: number; height: number };
}

export class VisualClient {
  constructor(private page: Page) {}

  /**
   * Assert page visual snapshot matches baseline
   */
  async assertSnapshot(name: string, options: VisualSnapshotOptions = {}): Promise<void> {
    const formattedName = name.endsWith('.png') ? name : `${name}.png`;
    const maskLocators = options.mask
      ? options.mask.map((m) => (typeof m === 'string' ? this.page.locator(m) : m))
      : undefined;

    await expect(this.page).toHaveScreenshot(formattedName, {
      mask: maskLocators,
      maxDiffPixels: options.maxDiffPixels,
      maxDiffPixelRatio: options.maxDiffPixelRatio,
      threshold: options.threshold || 0.2,
      fullPage: options.fullPage ?? false,
      animations: options.animations || 'disabled',
      clip: options.clip,
    });
  }

  /**
   * Assert specific element / component visual snapshot matches baseline
   */
  async assertElementSnapshot(
    locatorOrSelector: Locator | string,
    name: string,
    options: VisualSnapshotOptions = {}
  ): Promise<void> {
    const formattedName = name.endsWith('.png') ? name : `${name}.png`;
    const locator = typeof locatorOrSelector === 'string' ? this.page.locator(locatorOrSelector) : locatorOrSelector;
    const maskLocators = options.mask
      ? options.mask.map((m) => (typeof m === 'string' ? this.page.locator(m) : m))
      : undefined;

    await expect(locator).toHaveScreenshot(formattedName, {
      mask: maskLocators,
      maxDiffPixels: options.maxDiffPixels,
      maxDiffPixelRatio: options.maxDiffPixelRatio,
      threshold: options.threshold || 0.2,
      animations: options.animations || 'disabled',
    });
  }
}
