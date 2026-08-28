import { describe, it, expect } from 'vitest';
import { DeviceDetector } from '../src/clients/mobile/DeviceDetector';


describe('DeviceDetector', () => {
  it('should check host tools and safely query device lists', () => {
    const isAdb = DeviceDetector.isAdbAvailable();
    expect(typeof isAdb).toBe('boolean');

    const isSimctl = DeviceDetector.isSimctlAvailable();
    expect(typeof isSimctl).toBe('boolean');

    const androidDevices = DeviceDetector.getAndroidDevices();
    expect(Array.isArray(androidDevices)).toBe(true);

    const iosSimulators = DeviceDetector.getIosSimulators();
    expect(Array.isArray(iosSimulators)).toBe(true);

    const activeDevices = DeviceDetector.getActiveDevices();
    expect(Array.isArray(activeDevices)).toBe(true);
  });
});
