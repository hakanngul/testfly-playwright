import { MailClient } from '../mail/MailClient';

export const mailFixture = async ({}: any, use: (r: MailClient) => Promise<void>) => {
  const client = new MailClient();
  await use(client);
  await client.clear();
};
