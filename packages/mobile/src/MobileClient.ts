import { MobileDriver, requireDriverMethod } from './driver';
import { MobileScreen } from './MobileScreen';

/**
 * Static options for {@link MobileClient}. The `@testfly/playwright` config has no
 * mobile section (this package is experimental), so options are passed explicitly.
 */
export interface MobileClientOptions {
  platform?: 'ios' | 'android';
  bundleId?: string;
  deviceName?: string;
}

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
  private driver?: MobileDriver;

  constructor(driver?: MobileDriver, options: MobileClientOptions = {}) {
    this.driver = driver;
    this.screen = new MobileScreen(driver);

    this.platform = options.platform === 'ios' ? 'ios' : 'android';
    this.bundleId = options.bundleId || '';
    this.deviceName = options.deviceName || 'AutoDetected';
  }

  /**
   * Launch target mobile application by bundle ID or package name
   */
  async launchApp(bundleId?: string, options: MobileLaunchOptions = {}): Promise<void> {
    const targetBundle = bundleId || this.bundleId;
    await requireDriverMethod(this.driver, 'launchApp', 'client.launchApp')(targetBundle, options);
  }

  /**
   * Terminate / Close target mobile application
   */
  async terminateApp(bundleId?: string): Promise<void> {
    const targetBundle = bundleId || this.bundleId;
    await requireDriverMethod(this.driver, 'terminateApp', 'client.terminateApp')(targetBundle);
  }

  /**
   * Install native application (.apk or .ipa / .app)
   */
  async installApp(appPath: string): Promise<void> {
    await requireDriverMethod(this.driver, 'installApp', 'client.installApp')(appPath);
  }

  /**
   * Uninstall native application
   */
  async uninstallApp(bundleId?: string): Promise<void> {
    const targetBundle = bundleId || this.bundleId;
    await requireDriverMethod(this.driver, 'uninstallApp', 'client.uninstallApp')(targetBundle);
  }

  /**
   * Open a deep link / universal link inside the mobile app
   */
  async deepLink(url: string): Promise<void> {
    await requireDriverMethod(this.driver, 'deepLink', 'client.deepLink')(url);
  }

  /**
   * Change device screen orientation
   */
  async setOrientation(orientation: 'PORTRAIT' | 'LANDSCAPE'): Promise<void> {
    await requireDriverMethod(this.driver, 'setOrientation', 'client.setOrientation')(orientation);
  }
}
