import { execSync } from 'child_process';

export interface MobileDeviceItem {
  id: string;
  name: string;
  platform: 'ios' | 'android';
  state: 'booted' | 'shutdown' | 'device' | 'offline' | 'unauthorized';
  isSimulator: boolean;
  osVersion?: string;
}

export class DeviceDetector {
  /**
   * Check if Android Debug Bridge (ADB) is installed and available in PATH
   */
  static isAdbAvailable(): boolean {
    try {
      execSync('adb version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if iOS Simulator Control (simctl) is installed (macOS only)
   */
  static isSimctlAvailable(): boolean {
    if (process.platform !== 'darwin') return false;
    try {
      execSync('xcrun simctl help', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect all connected or running Android devices and emulators
   */
  static getAndroidDevices(): MobileDeviceItem[] {
    if (!this.isAdbAvailable()) return [];

    try {
      const output = execSync('adb devices -l', { encoding: 'utf8' });
      const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
      const devices: MobileDeviceItem[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('* daemon')) continue;

        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const id = parts[0];
          const rawState = parts[1];
          const isSimulator = id.startsWith('emulator-');

          let state: MobileDeviceItem['state'] = 'device';
          if (rawState === 'offline') state = 'offline';
          if (rawState === 'unauthorized') state = 'unauthorized';

          const modelMatch = line.match(/model:([^\s]+)/);
          const name = modelMatch ? modelMatch[1].replace(/_/g, ' ') : id;

          devices.push({
            id,
            name,
            platform: 'android',
            state,
            isSimulator,
          });
        }
      }

      return devices;
    } catch {
      return [];
    }
  }

  /**
   * Detect all iOS Simulators (Booted and Available)
   */
  static getIosSimulators(): MobileDeviceItem[] {
    if (!this.isSimctlAvailable()) return [];

    try {
      const output = execSync('xcrun simctl list devices --json', { encoding: 'utf8' });
      const json = JSON.parse(output);
      const devicesMap = json.devices || {};
      const result: MobileDeviceItem[] = [];

      for (const [runtimeKey, deviceList] of Object.entries<any>(devicesMap)) {
        const versionMatch = runtimeKey.match(/iOS[.-](\d+[.-]\d+)/);
        const osVersion = versionMatch ? versionMatch[1].replace('-', '.') : undefined;

        for (const dev of deviceList) {
          if (dev.isAvailable) {
            result.push({
              id: dev.udid,
              name: dev.name,
              platform: 'ios',
              state: dev.state.toLowerCase() === 'booted' ? 'booted' : 'shutdown',
              isSimulator: true,
              osVersion,
            });
          }
        }
      }

      return result;
    } catch {
      return [];
    }
  }

  /**
   * Get all active and ready mobile devices (Booted simulators + connected Android devices)
   */
  static getActiveDevices(): MobileDeviceItem[] {
    const android = this.getAndroidDevices().filter((d) => d.state === 'device');
    const ios = this.getIosSimulators().filter((d) => d.state === 'booted');
    return [...android, ...ios];
  }
}
