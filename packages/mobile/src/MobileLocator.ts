import { MobileDriver, requireDriverMethod } from './driver';

export interface MobileLocatorOptions {
  exact?: boolean;
  timeout?: number;
}

export type MobileRole = 'button' | 'header' | 'link' | 'checkbox' | 'radio' | 'image' | 'text' | 'cell' | 'tab';

/**
 * Lazy mobile element handle. Every action/assertion is delegated to the attached
 * driver; without one it throws `TF_FEATURE_DISABLED` instead of silently passing.
 */
export class MobileLocator {
  constructor(
    public readonly selector: string,
    public readonly type: 'text' | 'label' | 'testid' | 'role' | 'type' | 'custom',
    public readonly options: Record<string, any> = {},
    private driver?: MobileDriver
  ) {}

  /**
   * Tap / Click on the mobile element
   */
  async tap(): Promise<void> {
    await requireDriverMethod(this.driver, 'tap', 'locator.tap')(this);
  }

  /**
   * Double tap on the mobile element
   */
  async doubleTap(): Promise<void> {
    await requireDriverMethod(this.driver, 'doubleTap', 'locator.doubleTap')(this);
  }

  /**
   * Long press on the mobile element
   */
  async longPress(durationMs: number = 1000): Promise<void> {
    await requireDriverMethod(this.driver, 'longPress', 'locator.longPress')(this, durationMs);
  }

  /**
   * Fill text into input field
   */
  async fill(text: string): Promise<void> {
    await requireDriverMethod(this.driver, 'fill', 'locator.fill')(this, text);
  }

  /**
   * Clear text from input field
   */
  async clear(): Promise<void> {
    await requireDriverMethod(this.driver, 'clear', 'locator.clear')(this);
  }

  /**
   * Swipe gesture relative to this element
   */
  async swipe(direction: 'up' | 'down' | 'left' | 'right', options: { distance?: number } = {}): Promise<void> {
    await requireDriverMethod(this.driver, 'swipe', 'locator.swipe')(direction, { ...options, target: this });
  }

  /**
   * Assert element is visible on screen
   */
  async toBeVisible(): Promise<boolean> {
    return await requireDriverMethod<(locator: MobileLocator) => Promise<boolean>>(
      this.driver,
      'isVisible',
      'locator.toBeVisible'
    )(this);
  }

  /**
   * Assert element is enabled / clickable
   */
  async toBeEnabled(): Promise<boolean> {
    return await requireDriverMethod<(locator: MobileLocator) => Promise<boolean>>(
      this.driver,
      'isEnabled',
      'locator.toBeEnabled'
    )(this);
  }

  /**
   * Get first matching element
   */
  first(): MobileLocator {
    return new MobileLocator(this.selector, this.type, { ...this.options, index: 0 }, this.driver);
  }

  /**
   * Get last matching element
   */
  last(): MobileLocator {
    return new MobileLocator(this.selector, this.type, { ...this.options, index: -1 }, this.driver);
  }

  /**
   * Get Nth matching element
   */
  nth(index: number): MobileLocator {
    return new MobileLocator(this.selector, this.type, { ...this.options, index }, this.driver);
  }
}
