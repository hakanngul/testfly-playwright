import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execSyncMock } = vi.hoisted(() => ({ execSyncMock: vi.fn() }));
vi.mock('child_process', () => ({ execSync: execSyncMock }));

import { DeviceDetector } from '../src/DeviceDetector';

/** Route mocked `execSync` calls by command; unknown commands throw like a missing binary. */
function mockCommands(outputs: Record<string, string | Error>): void {
  execSyncMock.mockImplementation((cmd: string) => {
    const out = outputs[cmd];
    if (out === undefined) throw new Error(`command not found: ${cmd}`);
    if (out instanceof Error) throw out;
    return out;
  });
}

const ADB_OUTPUT = [
  'List of devices attached',
  '* daemon started successfully',
  'emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:1',
  'R58M123ABC             device usb:1-1 product:beyond1 model:SM_G973F device:beyond1 transport_id:2',
  '0123456789ABCDEF       unauthorized usb:1-2 transport_id:3',
  'emulator-5556          offline transport_id:4',
  '',
].join('\n');

const SIMCTL_OUTPUT = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-17-2': [
      { udid: 'UDID-1', name: 'iPhone 15', state: 'Booted', isAvailable: true },
      { udid: 'UDID-2', name: 'iPhone 15 Pro', state: 'Shutdown', isAvailable: true },
      { udid: 'UDID-3', name: 'iPhone 8', state: 'Shutdown', isAvailable: false },
    ],
    'com.apple.CoreSimulator.SimRuntime.watchOS-10-2': [
      { udid: 'UDID-4', name: 'Apple Watch', state: 'Booted', isAvailable: true },
    ],
  },
});

describe('DeviceDetector', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    execSyncMock.mockReset();
    Object.defineProperty(process, 'platform', { value: 'darwin' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('getAndroidDevices', () => {
    it('parses `adb devices -l` output (state, emulator flag, model name)', () => {
      mockCommands({ 'adb version': 'Android Debug Bridge', 'adb devices -l': ADB_OUTPUT });

      expect(DeviceDetector.getAndroidDevices()).toEqual([
        { id: 'emulator-5554', name: 'sdk gphone64 arm64', platform: 'android', state: 'device', isSimulator: true },
        { id: 'R58M123ABC', name: 'SM G973F', platform: 'android', state: 'device', isSimulator: false },
        { id: '0123456789ABCDEF', name: '0123456789ABCDEF', platform: 'android', state: 'unauthorized', isSimulator: false },
        { id: 'emulator-5556', name: 'emulator-5556', platform: 'android', state: 'offline', isSimulator: true },
      ]);
    });

    it('returns [] when adb is not installed', () => {
      mockCommands({});
      expect(DeviceDetector.isAdbAvailable()).toBe(false);
      expect(DeviceDetector.getAndroidDevices()).toEqual([]);
    });

    it('returns [] when only the header line is printed', () => {
      mockCommands({ 'adb version': 'ok', 'adb devices -l': 'List of devices attached\n\n' });
      expect(DeviceDetector.getAndroidDevices()).toEqual([]);
    });

    it('returns [] when `adb devices` fails', () => {
      mockCommands({ 'adb version': 'ok', 'adb devices -l': new Error('boom') });
      expect(DeviceDetector.getAndroidDevices()).toEqual([]);
    });
  });

  describe('getIosSimulators', () => {
    it('parses `xcrun simctl list devices --json` (available only, state, iOS version)', () => {
      mockCommands({ 'xcrun simctl help': 'usage', 'xcrun simctl list devices --json': SIMCTL_OUTPUT });

      expect(DeviceDetector.getIosSimulators()).toEqual([
        { id: 'UDID-1', name: 'iPhone 15', platform: 'ios', state: 'booted', isSimulator: true, osVersion: '17.2' },
        { id: 'UDID-2', name: 'iPhone 15 Pro', platform: 'ios', state: 'shutdown', isSimulator: true, osVersion: '17.2' },
        { id: 'UDID-4', name: 'Apple Watch', platform: 'ios', state: 'booted', isSimulator: true, osVersion: undefined },
      ]);
    });

    it('returns [] on non-macOS without invoking xcrun', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockCommands({ 'xcrun simctl help': 'usage', 'xcrun simctl list devices --json': SIMCTL_OUTPUT });

      expect(DeviceDetector.isSimctlAvailable()).toBe(false);
      expect(DeviceDetector.getIosSimulators()).toEqual([]);
      expect(execSyncMock).not.toHaveBeenCalled();
    });

    it('returns [] on malformed JSON', () => {
      mockCommands({ 'xcrun simctl help': 'usage', 'xcrun simctl list devices --json': '{not json' });
      expect(DeviceDetector.getIosSimulators()).toEqual([]);
    });
  });

  describe('getActiveDevices', () => {
    it('keeps only ready Android devices and booted iOS simulators', () => {
      mockCommands({
        'adb version': 'ok',
        'adb devices -l': ADB_OUTPUT,
        'xcrun simctl help': 'usage',
        'xcrun simctl list devices --json': SIMCTL_OUTPUT,
      });

      expect(DeviceDetector.getActiveDevices().map((d) => d.id)).toEqual(['emulator-5554', 'R58M123ABC', 'UDID-1', 'UDID-4']);
    });
  });
});
