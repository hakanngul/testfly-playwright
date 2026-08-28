import { MobileScreen } from './MobileScreen';
import { getTestFlyConfig } from '../../core/config';


export interface MobileLaunchOptions {
  bundleId?: string;
  clearState?: boolean;
  env?: Record<string, string>;
}

export class MobileClient {
  public screen: MobileScreen;
  public platform: 'ios' | 'android';
  public bundleId: string;
  public deviceName: string;
  private driver?: any;

  constructor(driver?: any) {
    this.driver = driver;
    this.screen = new MobileScreen(driver);

    const config = getTestFlyConfig();
    this.platform = config.mobile?.platform === 'ios' ? 'ios' : 'android';
    this.bundleId = config.mobile?.bundleId || '';
    this.deviceName = config.mobile?.deviceName || 'AutoDetected';
  }

  /**
   * Launch target mobile application by bundle ID or package name
   */
  async launchApp(bundleId?: string, options: MobileLaunchOptions = {}): Promise<void> {
    const targetBundle = bundleId || this.bundleId;
    if (this.driver && typeof this.driver.launchApp === 'function') {
      await this.driver.launchApp(targetBundle, options);
    }
  }

  /**
   * Terminate / Close target mobile application
   */
  async terminateApp(bundleId?: string): Promise<void> {
    const targetBundle = bundleId || this.bundleId;
    if (this.driver && typeof this.driver.terminateApp === 'function') {
      await this.driver.terminateApp(targetBundle);
    }
  }

  /**
   * Install native application (.apk or .ipa / .app)
   */
  async installApp(appPath: string): Promise<void> {
    if (this.driver && typeof this.driver.installApp === 'function') {
      await this.driver.installApp(appPath);
    }
  }

  /**
   * Uninstall native application
   */
  async uninstallApp(bundleId?: string): Promise<void> {
    const targetBundle = bundleId || this.bundleId;
    if (this.driver && typeof this.driver.uninstallApp === 'function') {
      await this.driver.uninstallApp(targetBundle);
    }
  }

  /**
   * Open a deep link / universal link inside the mobile app
   */
  async deepLink(url: string): Promise<void> {
    if (this.driver && typeof this.driver.deepLink === 'function') {
      await this.driver.deepLink(url);
    }
  }

  /**
   * Change device screen orientation
   */
  async setOrientation(orientation: 'PORTRAIT' | 'LANDSCAPE'): Promise<void> {
    if (this.driver && typeof this.driver.setOrientation === 'function') {
      await this.driver.setOrientation(orientation);
    }
  }
}
