import { DeviceDetector } from '../clients/mobile/DeviceDetector';


export interface MobileCliOptions {
  all?: boolean;
}

export async function runMobileCommand(action: string = 'devices', options: MobileCliOptions = {}): Promise<void> {
  if (action === 'devices') {
    console.log(`\n📱 TestFly Mobile — Bağlı ve Algılanan Cihazlar Taranıyor...\n`);

    const hasAdb = DeviceDetector.isAdbAvailable();
    const hasSimctl = DeviceDetector.isSimctlAvailable();

    if (!hasAdb && !hasSimctl) {
      console.log(`❌ Sistemde Android ADB veya iOS Xcode simctl bulunamadı.`);
      console.log(`👉 Android için: Android SDK ve platform-tools kurun.`);
      console.log(`👉 iOS için: Xcode ve Command Line Tools kurun.\n`);
      return;
    }

    const androidDevices = DeviceDetector.getAndroidDevices();
    const iosSimulators = DeviceDetector.getIosSimulators();

    const displayIos = options.all ? iosSimulators : iosSimulators.filter((d) => d.state === 'booted');

    console.log(`🤖 Android Cihazları (${androidDevices.length}):`);
    if (androidDevices.length === 0) {
      console.log(`   (Bağlı cihaz veya açık emülatör bulunamadı)`);
    } else {
      for (const dev of androidDevices) {
        const icon = dev.state === 'device' ? '🟢' : '🟡';
        console.log(`   ${icon} [${dev.id}] ${dev.name} (${dev.state})`);
      }
    }

    console.log(`\n🍎 iOS Simülatörleri (${displayIos.length}):`);
    if (displayIos.length === 0) {
      console.log(`   (Açık simülatör bulunamadı. Tümünü görmek için: npx testfly mobile devices --all)`);
    } else {
      for (const dev of displayIos) {
        const icon = dev.state === 'booted' ? '🟢' : '⚪';
        console.log(`   ${icon} [${dev.id}] ${dev.name} (iOS ${dev.osVersion || 'unknown'}) [${dev.state}]`);
      }
    }
    console.log('');
  }
}
