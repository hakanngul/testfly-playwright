import { ApiClient } from '../client/ApiClient';

export const apiFixture = async ({ request }: { request: any }, use: (r: ApiClient) => Promise<void>) => {
  const client = new ApiClient(request);
  await use(client);
};
