import { mobileTest } from '../src';
import { createFakeDriver } from '../test/support/fakeDriver';

// Expected failures: each test fails with the TestFly error named in its title.

mobileTest.describe('device that cannot connect', () => {
  mobileTest.use({ mobileDriver: createFakeDriver({ failConnect: true }) });
  mobileTest.fail('device fails with TF_MOBILE_LAUNCH_FAILED', async ({ device }) => {
    void device;
  });
});

mobileTest.describe('key without a native definition', () => {
  mobileTest.use({ mobileDriver: createFakeDriver() });
  mobileTest.fail('mobileLocate fails with TF_LOCATOR_NOT_FOUND', async ({ mobileLocate }) => {
    mobileLocate('login.webOnly');
  });
});
