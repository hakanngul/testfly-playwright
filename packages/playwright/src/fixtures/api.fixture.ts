import { ApiClient } from '../clients/api/ApiClient';


export const apiFixture = async ({ request }: { request: any }, use: (r: ApiClient) => Promise<void>) => {
  const client = new ApiClient(request);
  await use(client);
};
