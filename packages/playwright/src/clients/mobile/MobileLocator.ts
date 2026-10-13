export interface MobileLocatorOptions {
  exact?: boolean;
  timeout?: number;
}

export type MobileRole = 'button' | 'header' | 'link' | 'checkbox' | 'radio' | 'image' | 'text' | 'cell' | 'tab';

export class MobileLocator {
  constructor(
    public readonly selector: string,
    public readonly type: 'text' | 'label' | 'testid' | 'role' | 'type' | 'custom',
    public readonly options: Record<string, any> = {},
    private driver?: any
  ) {}

  /**
   * Tap / Click on the mobile element
   */
  async tap(): Promise<void> {
    if (this.driver && typeof this.driver.tap === 'function') {
      await this.driver.tap(this);
    }
  }

  /**
   * Double tap on the mobile element
   */
  async doubleTap(): Promise<void> {
    if (this.driver && typeof this.driver.doubleTap === 'function') {
      await this.driver.doubleTap(this);
    }
  }

  /**
   * Long press on the mobile element
   */
  async longPress(durationMs: number = 1000): Promise<void> {
    if (this.driver && typeof this.driver.longPress === 'function') {
      await this.driver.longPress(this, durationMs);
    }
  }

  /**
   * Fill text into input field
   */
  async fill(text: string): Promise<void> {
    if (this.driver && typeof this.driver.fill === 'function') {
      await this.driver.fill(this, text);
    }
  }

  /**
   * Clear text from input field
   */
  async clear(): Promise<void> {
    if (this.driver && typeof this.driver.clear === 'function') {
      await this.driver.clear(this);
    }
  }

  /**
   * Swipe gesture relative to this element
   */
  async swipe(direction: 'up' | 'down' | 'left' | 'right', options: { distance?: number } = {}): Promise<void> {
    if (this.driver && typeof this.driver.swipe === 'function') {
      await this.driver.swipe(direction, { ...options, target: this });
    }
  }

  /**
   * Assert element is visible on screen
   */
  async toBeVisible(): Promise<boolean> {
    if (this.driver && typeof this.driver.isVisible === 'function') {
      return await this.driver.isVisible(this);
    }
    return true;
  }

  /**
   * Assert element is enabled / clickable
   */
  async toBeEnabled(): Promise<boolean> {
    if (this.driver && typeof this.driver.isEnabled === 'function') {
      return await this.driver.isEnabled(this);
    }
    return true;
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
