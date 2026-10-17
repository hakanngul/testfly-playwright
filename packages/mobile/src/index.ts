/**
 * @testfly/mobile — experimental native mobile testing on Mobilewright (which drives devices via mobilecli).
 *
 * Entry points: `@testfly/mobile` (this file), `/bdd`.
 */
export { mobileTest, mobileTest as test } from './fixtures';
export type { MobileFixtures } from './fixtures';
export { expect } from './expect';
export type { TestFlyMobileExpect, MobileLocatorAssertions, MobileExpectOptions, MobileExpectTextOptions } from './expect';
export type { MobileLocateFn } from './locate';
export * from './DeviceDetector';
export type { Device, Screen, Locator as MobileLocator, MobilewrightDriver, LaunchOptions } from 'mobilewright';
