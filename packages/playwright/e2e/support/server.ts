import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const counters = new Map<string, number>();
const bump = (key: string): number => {
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  return n;
};

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw));
  });
}

/** Local application under test for the integration suite. */
export async function startAppServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const json = (status: number, body: unknown, headers: Record<string, string> = {}): void => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };

    switch (url.pathname) {
      case '/json':
        return json(200, { hello: 'world', items: [{ id: 1 }, { id: 2 }] }, { 'x-test': 'yes' });
      case '/echo': {
        const raw = await readBody(req);
        return json(200, { method: req.method, contentType: req.headers['content-type'] ?? null, body: raw, query: Object.fromEntries(url.searchParams) });
      }
      case '/auth':
        return json(200, { authorization: req.headers.authorization ?? null, custom: req.headers['x-custom'] ?? null });
      case '/flaky': {
        const n = bump(`flaky:${url.searchParams.get('key') ?? ''}`);
        return n <= 2 ? json(503, { attempt: n }) : json(200, { attempt: n });
      }
      case '/always-503':
        return json(503, { error: 'down' });
      case '/poll': {
        const n = bump(`poll:${url.searchParams.get('key') ?? ''}`);
        return json(200, { ready: n >= 3, n });
      }
      case '/missing':
        return json(404, { error: 'not found' });
      case '/login':
        bump('login');
        res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'sid=abc123; Path=/' });
        return res.end('<html><body>login<script>localStorage.setItem("token","tok-1")</script></body></html>');
      case '/login-count':
        return json(200, { count: counters.get('login') ?? 0 });
      case '/whoami':
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html><body><p id="who"></p><script>document.getElementById("who").textContent = (document.cookie.includes("sid=abc123") ? "cookie" : "no-cookie") + ":" + (localStorage.getItem("token") || "no-token")</script></body></html>');
      case '/page':
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html><body><h1>Hello page</h1><button>Click me</button></body></html>');
      case '/fetches':
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html><body><script>fetch("/json").then(r => r.json()).then(d => { document.body.textContent = "live:" + d.hello; });</script></body></html>');
      default:
        res.writeHead(404);
        return res.end('nope');
    }
  });
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

export function resetSessions(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
