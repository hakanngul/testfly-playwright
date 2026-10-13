import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface CapturedRequest {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  text: string;
}

export type Handler = (req: CapturedRequest, res: ServerResponse, raw: IncomingMessage) => void | Promise<void>;

export interface TestServer {
  url: string;
  requests: CapturedRequest[];
  /** Replace the request handler. */
  handle(h: Handler): void;
  close(): Promise<void>;
}

/** Start a local node:http server on a random port. */
export async function startServer(initial: Handler): Promise<TestServer> {
  let handler = initial;
  const requests: CapturedRequest[] = [];
  const server: Server = createServer((raw, res) => {
    const chunks: Buffer[] = [];
    raw.on('data', (c: Buffer) => chunks.push(c));
    raw.on('end', () => {
      const body = Buffer.concat(chunks);
      const u = new URL(raw.url ?? '/', 'http://localhost');
      const req: CapturedRequest = {
        method: raw.method ?? 'GET',
        url: raw.url ?? '/',
        path: u.pathname,
        query: u.searchParams,
        headers: raw.headers,
        body,
        text: body.toString('utf8'),
      };
      requests.push(req);
      Promise.resolve(handler(req, res, raw)).catch((err) => {
        res.statusCode = 500;
        res.end(String(err));
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    handle(h) {
      handler = h;
    },
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }),
  };
}

export function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}
