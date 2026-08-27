import { DbClient } from '../db/DbClient';

export const dbFixture = async ({}: any, use: (r: DbClient) => Promise<void>) => {
  const client = new DbClient();
  await use(client);
  await client.cleanup();
};
