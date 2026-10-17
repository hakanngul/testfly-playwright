import type { MobilewrightDriver } from 'mobilewright';

// A tiny in-memory "app" behind Mobilewright's driver interface, so the fixtures, YAML locators and
// assertions run end to end without mobilecli or a device. Screens: login → home (after "Sign in" with a
// username). Elements are laid out in rows so taps resolve by coordinates like on a real device.

export const FAKE_BUNDLE_ID = 'dev.testfly.demo';
export const FAKE_DEVICE_ID = 'FAKE-0001';

type Node = Awaited<ReturnType<MobilewrightDriver['getViewHierarchy']>>[number];

// 1×1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export interface FakeDriverLog {
  calls: string[];
}

export function createFakeDriver(opts: { failConnect?: boolean } = {}): MobilewrightDriver & FakeDriverLog {
  const calls: string[] = [];
  let screen: 'login' | 'home' = 'login';
  let foreground = 'com.apple.springboard';
  let focused: string | undefined;
  const values: Record<string, string> = { username: '', password: '' };

  const row = (i: number) => ({ x: 20, y: 100 + i * 80, width: 350, height: 60 });
  const node = (n: Partial<Node> & { type: string }, i: number): Node => ({ isVisible: true, isEnabled: true, bounds: row(i), children: [], ...n });

  function tree(): Node[] {
    if (foreground !== FAKE_BUNDLE_ID) return [];
    const children: Node[] =
      screen === 'login'
        ? [
            node({ type: 'StaticText', label: 'Welcome back', text: 'Welcome back' }, 0),
            node({ type: 'TextField', identifier: 'username', label: 'Username', placeholder: 'Username', value: values.username, isFocused: focused === 'username' }, 1),
            node({ type: 'SecureTextField', identifier: 'password', label: 'Password', placeholder: 'Password', value: values.password, isFocused: focused === 'password' }, 2),
            node({ type: 'Button', identifier: 'sign-in', label: 'Sign in', isEnabled: values.username.length > 0 }, 3),
          ]
        : [
            node({ type: 'StaticText', identifier: 'greeting', label: `Hello, ${values.username}`, text: `Hello, ${values.username}` }, 0),
            node({ type: 'Cell', label: 'Orders', text: 'Orders' }, 1),
            node({ type: 'Cell', label: 'Settings', text: 'Settings' }, 2),
            node({ type: 'Button', identifier: 'sign-out', label: 'Sign out' }, 3),
          ];
    return [{ type: 'Window', isVisible: true, isEnabled: true, bounds: { x: 0, y: 0, width: 390, height: 844 }, children }];
  }

  function hit(x: number, y: number): Node | undefined {
    return tree()[0]?.children.find((n) => x >= n.bounds.x && x <= n.bounds.x + n.bounds.width && y >= n.bounds.y && y <= n.bounds.y + n.bounds.height);
  }

  const notSupported = (name: string) => async () => {
    throw new Error(`fake driver: ${name} is not supported`);
  };

  return {
    calls,
    // DeviceAllocator
    allocate: notSupported('allocate'),
    release: async () => {},
    // MobilewrightSession
    async listDevices() {
      calls.push('listDevices');
      return [
        { id: 'FAKE-OFF', name: 'iPhone 15', platform: 'ios', type: 'simulator', state: 'offline' },
        { id: FAKE_DEVICE_ID, name: 'iPhone 16 (fake)', platform: 'ios', type: 'simulator', state: 'online' },
        { id: 'FAKE-ANDROID', name: 'Pixel 9 (fake)', platform: 'android', type: 'emulator', state: 'online' },
      ];
    },
    async connect(config) {
      calls.push(`connect:${config.deviceId}`);
      if (opts.failConnect) throw new Error('device is locked');
      return { deviceId: config.deviceId ?? FAKE_DEVICE_ID, platform: config.platform };
    },
    async disconnect() {
      calls.push('disconnect');
    },
    async applyDeviceSettings(settings) {
      calls.push(`settings:${JSON.stringify(settings)}`);
    },
    async getViewHierarchy() {
      return tree();
    },
    async tap(x, y) {
      const target = hit(x, y);
      calls.push(`tap:${target?.identifier ?? target?.label ?? '?'}`);
      if (!target) return;
      if (target.identifier === 'username' || target.identifier === 'password') focused = target.identifier;
      else focused = undefined;
      if (target.identifier === 'sign-in' && target.isEnabled) screen = 'home';
      if (target.identifier === 'sign-out') {
        screen = 'login';
        values.username = values.password = '';
      }
    },
    doubleTap: notSupported('doubleTap'),
    longPress: notSupported('longPress'),
    async typeText(text) {
      calls.push(`type:${focused}`);
      if (focused) values[focused] += text;
    },
    pressKeys: notSupported('pressKeys'),
    async clearText() {
      if (focused) values[focused] = '';
    },
    swipe: notSupported('swipe'),
    gesture: notSupported('gesture'),
    pressButton: notSupported('pressButton'),
    async screenshot() {
      calls.push('screenshot');
      return PNG;
    },
    async getScreenSize() {
      return { width: 390, height: 844, scale: 3 };
    },
    async getOrientation() {
      return 'portrait';
    },
    setOrientation: notSupported('setOrientation'),
    setGeolocation: notSupported('setGeolocation'),
    setFoldState: notSupported('setFoldState'),
    async launchApp(bundleId) {
      calls.push(`launch:${bundleId}`);
      if (bundleId !== FAKE_BUNDLE_ID) throw new Error(`app ${bundleId} is not installed`);
      foreground = bundleId;
      screen = 'login';
    },
    async terminateApp(bundleId) {
      calls.push(`terminate:${bundleId}`);
      if (foreground === bundleId) foreground = 'com.apple.springboard';
    },
    clearAppData: notSupported('clearAppData'),
    async listApps() {
      return [{ bundleId: FAKE_BUNDLE_ID, name: 'TestFly Demo' }];
    },
    async getForegroundApp() {
      return { bundleId: foreground };
    },
    async installApp(path) {
      calls.push(`install:${path}`);
    },
    uninstallApp: notSupported('uninstallApp'),
    openUrl: notSupported('openUrl'),
    startRecording: notSupported('startRecording'),
    stopRecording: notSupported('stopRecording'),
  };
}
