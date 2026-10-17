import { mobileTest } from '../src';

// Expected failure: no testfly.mobile in this project.
mobileTest.fail('device fails with TF_CONFIG_MISSING', async ({ device }) => {
  void device;
});
