import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TestServer {
  url: string;
  close(): Promise<void>;
}

/** Start a local HTTP server on a random port. */
export async function startServer(handler: http.RequestListener): Promise<TestServer> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
