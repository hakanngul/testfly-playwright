import { MobileLocator, MobileLocatorOptions, MobileRole } from './MobileLocator';

export interface MobileScreenOptions {
  driver?: any;
}

export class MobileScreen {
  constructor(private driver?: any) {}

  /**
   * Locate element by visible text content
   */
  getByText(text: string | RegExp, options?: MobileLocatorOptions): MobileLocator {
    const selector = typeof text === 'string' ? text : text.source;
    return new MobileLocator(selector, 'text', options, this.driver);
  }

  /**
   * Locate element by accessibility label (accessibilityLabel on iOS, contentDescription on Android)
   */
  getByLabel(label: string | RegExp, options?: MobileLocatorOptions): MobileLocator {
    const selector = typeof label === 'string' ? label : label.source;
    return new MobileLocator(selector, 'label', options, this.driver);
  }

  /**
   * Locate element by test ID (accessibilityIdentifier on iOS, resource-id on Android)
   */
  getByTestId(testId: string): MobileLocator {
    return new MobileLocator(testId, 'testid', {}, this.driver);
  }

  /**
   * Locate element by semantic role (e.g. 'button', 'header', 'checkbox')
   */
  getByRole(role: MobileRole, options?: { name?: string | RegExp }): MobileLocator {
    const nameStr = options?.name ? (typeof options.name === 'string' ? options.name : options.name.source) : '';
    return new MobileLocator(role, 'role', { name: nameStr }, this.driver);
  }

  /**
   * Locate element by native type / class name (e.g. 'TextField', 'XCUIElementTypeButton', 'android.widget.Button')
   */
  getByType(type: string): MobileLocator {
    return new MobileLocator(type, 'type', {}, this.driver);
  }

  /**
   * Custom locator selector
   */
  locator(selector: string): MobileLocator {
    return new MobileLocator(selector, 'custom', {}, this.driver);
  }

  /**
   * Swipe across the full screen
   */
  async swipe(direction: 'up' | 'down' | 'left' | 'right', options: { distance?: number } = {}): Promise<void> {
    if (this.driver && typeof this.driver.swipe === 'function') {
      await this.driver.swipe(direction, options);
    }
  }

  /**
   * Press hardware / system button
   */
  async pressButton(button: 'HOME' | 'BACK' | 'VOLUME_UP' | 'VOLUME_DOWN'): Promise<void> {
    if (this.driver && typeof this.driver.pressButton === 'function') {
      await this.driver.pressButton(button);
    }
  }

  /**
   * Dismiss the on-screen soft keyboard
   */
  async hideKeyboard(): Promise<void> {
    if (this.driver && typeof this.driver.hideKeyboard === 'function') {
      await this.driver.hideKeyboard();
    }
  }

  /**
   * Take screenshot of current mobile screen
   */
  async takeScreenshot(name?: string): Promise<Buffer | null> {
    if (this.driver && typeof this.driver.takeScreenshot === 'function') {
      return await this.driver.takeScreenshot(name);
    }
    return null;
  }
}
