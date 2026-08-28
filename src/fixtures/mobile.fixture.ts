import { test as base } from '@playwright/test';
import { MobileClient } from '../clients/mobile/MobileClient';
import { MobileScreen } from '../clients/mobile/MobileScreen';


export interface MobileFixture {
  mobile: MobileClient;
  screen: MobileScreen;
}

export const mobileFixture = base.extend<MobileFixture>({
  mobile: async ({}, use) => {
    const mobileClient = new MobileClient();
    await use(mobileClient);
  },
  screen: async ({}, use) => {
    const mobileClient = new MobileClient();
    await use(mobileClient.screen);
  },
});
