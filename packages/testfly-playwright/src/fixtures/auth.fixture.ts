import { AuthManager } from '../auth/AuthManager';

export const authFixture = async ({}: any, use: (r: AuthManager) => Promise<void>) => {
  const manager = new AuthManager();
  await use(manager);
};
