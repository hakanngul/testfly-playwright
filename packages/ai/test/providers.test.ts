import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestFlyError } from '@testfly/playwright';
import { DEFAULT_MODELS, createProvider, registerProvider, resolveAiOptions } from '../src';
import type { LlmProvider } from '../src';

interface Captured {
  method?: string;
  url?: string;
  headers: IncomingMessage['headers'];
  body: any;
}

let server: Server;
let base: string;
let captured: Captured[] = [];
let handler: (req: IncomingMessage, res: ServerResponse, n: number) => void;

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      captured.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
      handler(req, res, captured.length);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const ENV = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'TESTFLY_AI_API_KEY'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  captured = [];
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const KEY = 'sk-test-SECRETKEY-1234567890';
const opts = (o: Record<string, unknown>) => resolveAiOptions({ apiKey: KEY, baseUrl: base, timeoutMs: 5_000, ...o } as never);
const REQ = { system: 'SYS', messages: [{ role: 'user' as const, content: 'hello' }], maxTokens: 123 };

async function expectCode(p: Promise<unknown>, code: string): Promise<TestFlyError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(TestFlyError);
  expect((err as TestFlyError).code).toBe(code);
  return err as TestFlyError;
}

describe('anthropic provider', () => {
  it('sends the Messages API request shape and parses text + usage', async () => {
    handler = (_req, res) => json(res, 200, { content: [{ type: 'text', text: 'hi ' }, { type: 'tool_use' }, { type: 'text', text: 'there' }], usage: { input_tokens: 11, output_tokens: 7 }, model: 'claude-x' });
    const p = createProvider(opts({ provider: 'anthropic' }));
    const res = await p.complete({ ...REQ, temperature: 0, json: true });
    expect(res).toEqual({ text: 'hi there', inputTokens: 11, outputTokens: 7, model: 'claude-x' });
    const c = captured[0];
    expect(c.method).toBe('POST');
    expect(c.url).toBe('/v1/messages');
    expect(c.headers['x-api-key']).toBe(KEY);
    expect(c.headers['anthropic-version']).toBe('2023-06-01');
    expect(c.headers['content-type']).toBe('application/json');
    expect(c.body.model).toBe(DEFAULT_MODELS.anthropic);
    expect(c.body.max_tokens).toBe(123);
    expect(c.body.temperature).toBe(0);
    expect(c.body.messages).toEqual(REQ.messages);
    expect(c.body.system).toContain('SYS');
    expect(c.body.system).toMatch(/JSON/);
  });

  it('does not add JSON instruction or temperature when not requested; honours custom model and trailing slash', async () => {
    handler = (_req, res) => json(res, 200, { content: [{ type: 'text', text: 'x' }] });
    const p = createProvider(opts({ provider: 'anthropic', model: 'my-model', baseUrl: `${base}///` }));
    const res = await p.complete(REQ);
    expect(captured[0].body.system).toBe('SYS');
    expect(captured[0].body.model).toBe('my-model');
    expect('temperature' in captured[0].body).toBe(false);
    expect(res.model).toBe('my-model');
    expect(res.inputTokens).toBeUndefined();
  });

  it('throws TF_AI_PROVIDER_ERROR when the response has no text', async () => {
    handler = (_req, res) => json(res, 200, { content: [] });
    await expectCode(createProvider(opts({ provider: 'anthropic' })).complete(REQ), 'TF_AI_PROVIDER_ERROR');
  });

  it('throws on non-JSON 200 body', async () => {
    handler = (_req, res) => {
      res.writeHead(200);
      res.end('<html>nope</html>');
    };
    await expectCode(createProvider(opts({ provider: 'anthropic' })).complete(REQ), 'TF_AI_PROVIDER_ERROR');
  });
});

describe('openai provider', () => {
  it('sends chat completions shape with JSON mode and Bearer auth', async () => {
    handler = (_req, res) => json(res, 200, { choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 4, completion_tokens: 2 }, model: 'gpt-x' });
    const p = createProvider(opts({ provider: 'openai', baseUrl: `${base}/v1` }));
    const res = await p.complete({ ...REQ, temperature: 0.3, json: true });
    expect(res).toEqual({ text: '{"a":1}', inputTokens: 4, outputTokens: 2, model: 'gpt-x' });
    const c = captured[0];
    expect(c.url).toBe('/v1/chat/completions');
    expect(c.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(c.body.model).toBe(DEFAULT_MODELS.openai);
    expect(c.body.response_format).toEqual({ type: 'json_object' });
    expect(c.body.max_completion_tokens).toBe(123);
    expect(c.body.max_tokens).toBeUndefined();
    expect(c.body.temperature).toBe(0.3);
    expect(c.body.messages[0].role).toBe('system');
    expect(c.body.messages[0].content).toContain('SYS');
    expect(c.body.messages[1]).toEqual({ role: 'user', content: 'hello' });
  });

  it('omits temperature for reasoning models (o-series / gpt-5)', async () => {
    handler = (_req, res) => json(res, 200, { choices: [{ message: { content: 'x' } }] });
    for (const model of ['o3-mini', 'gpt-5-mini']) {
      captured = [];
      await createProvider(opts({ provider: 'openai', model })).complete({ ...REQ, temperature: 0 });
      expect('temperature' in captured[0].body, model).toBe(false);
    }
  });

  it('openai-compatible uses max_tokens, requires baseUrl + model, and needs no api key', async () => {
    handler = (_req, res) => json(res, 200, { choices: [{ message: { content: 'ok' } }] });
    const p = createProvider(resolveAiOptions({ provider: 'openai-compatible', baseUrl: `${base}/v1`, model: 'llama3', timeoutMs: 5000 }));
    expect(p.name).toBe('openai-compatible');
    await p.complete(REQ);
    expect(captured[0].body.max_tokens).toBe(123);
    expect(captured[0].body.max_completion_tokens).toBeUndefined();
    expect(captured[0].headers.authorization).toBeUndefined();

    expect(() => createProvider(resolveAiOptions({ provider: 'openai-compatible', model: 'm' }))).toThrowError(/baseUrl/);
    try {
      createProvider(resolveAiOptions({ provider: 'openai-compatible', baseUrl: base }));
      expect.unreachable();
    } catch (e) {
      expect((e as TestFlyError).code).toBe('TF_AI_NOT_CONFIGURED');
    }
  });

  it('openai-compatible picks the api key up from TESTFLY_AI_API_KEY', async () => {
    process.env.TESTFLY_AI_API_KEY = 'env-key-123456';
    handler = (_req, res) => json(res, 200, { choices: [{ message: { content: 'ok' } }] });
    await createProvider(resolveAiOptions({ provider: 'openai-compatible', baseUrl: base, model: 'm' })).complete(REQ);
    expect(captured[0].headers.authorization).toBe('Bearer env-key-123456');
  });

  it('empty message content -> TF_AI_PROVIDER_ERROR', async () => {
    handler = (_req, res) => json(res, 200, { choices: [{ message: { content: null } }] });
    await expectCode(createProvider(opts({ provider: 'openai' })).complete(REQ), 'TF_AI_PROVIDER_ERROR');
  });
});

describe('gemini provider', () => {
  it('sends generateContent shape; key in header, never in the URL; maps roles', async () => {
    handler = (_req, res) => json(res, 200, { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3 }, modelVersion: 'gem-1' });
    const p = createProvider(opts({ provider: 'gemini', baseUrl: `${base}/v1beta` }));
    const res = await p.complete({
      system: 'SYS',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a1' },
      ],
      maxTokens: 50,
      temperature: 0,
      json: true,
    });
    expect(res).toEqual({ text: 'ab', inputTokens: 9, outputTokens: 3, model: 'gem-1' });
    const c = captured[0];
    expect(c.url).toBe(`/v1beta/models/${DEFAULT_MODELS.gemini}:generateContent`);
    expect(c.url).not.toContain(KEY);
    expect(c.headers['x-goog-api-key']).toBe(KEY);
    expect(c.body.systemInstruction.parts[0].text).toBe('SYS');
    expect(c.body.contents.map((x: any) => x.role)).toEqual(['user', 'model']);
    expect(c.body.generationConfig).toEqual({ maxOutputTokens: 50, temperature: 0, responseMimeType: 'application/json' });
  });

  it('blocked / empty candidate -> TF_AI_PROVIDER_ERROR', async () => {
    handler = (_req, res) => json(res, 200, { candidates: [] });
    await expectCode(createProvider(opts({ provider: 'gemini' })).complete(REQ), 'TF_AI_PROVIDER_ERROR');
  });
});

describe('retry, timeout and error hygiene', () => {
  it('429 with retry-after then success (waits for the header)', async () => {
    handler = (_req, res, n) => (n === 1 ? json(res, 429, { error: 'slow down' }, { 'retry-after': '1' }) : json(res, 200, { content: [{ type: 'text', text: 'ok' }] }));
    const t0 = Date.now();
    const res = await createProvider(opts({ provider: 'anthropic' })).complete(REQ);
    expect(res.text).toBe('ok');
    expect(captured).toHaveLength(2);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
  });

  it('5xx is retried exactly once, then surfaces as TF_AI_PROVIDER_ERROR with status', async () => {
    handler = (_req, res) => json(res, 503, { error: 'down' }, { 'retry-after': '0' });
    const err = await expectCode(createProvider(opts({ provider: 'openai' })).complete(REQ), 'TF_AI_PROVIDER_ERROR');
    expect(captured).toHaveLength(2);
    expect(err.message).toContain('HTTP 503');
  });

  it('5xx then success', async () => {
    handler = (_req, res, n) => (n === 1 ? json(res, 500, {}, { 'retry-after': '0' }) : json(res, 200, { choices: [{ message: { content: 'fine' } }] }));
    expect((await createProvider(opts({ provider: 'openai' })).complete(REQ)).text).toBe('fine');
  });

  it('4xx (not 429) is not retried', async () => {
    handler = (_req, res) => json(res, 400, { error: 'bad' });
    await expectCode(createProvider(opts({ provider: 'anthropic' })).complete(REQ), 'TF_AI_PROVIDER_ERROR');
    expect(captured).toHaveLength(1);
  });

  it('401 gives an API-key hint', async () => {
    handler = (_req, res) => json(res, 401, { error: 'bad key' });
    const err = await expectCode(createProvider(opts({ provider: 'anthropic' })).complete(REQ), 'TF_AI_PROVIDER_ERROR');
    expect(err.hint).toMatch(/API key/i);
  });

  it('timeout -> TF_AI_PROVIDER_ERROR', async () => {
    handler = () => {
      /* never answer */
    };
    const p = createProvider(opts({ provider: 'anthropic', timeoutMs: 300 }));
    const err = await expectCode(p.complete(REQ), 'TF_AI_PROVIDER_ERROR');
    expect(err.message).toMatch(/timed out after 300ms/);
  });

  it('caller abort -> TF_AI_PROVIDER_ERROR (aborted)', async () => {
    handler = () => {
      /* never answer */
    };
    const ac = new AbortController();
    const pr = createProvider(opts({ provider: 'anthropic' })).complete({ ...REQ, signal: ac.signal });
    setTimeout(() => ac.abort(), 100);
    const err = await expectCode(pr, 'TF_AI_PROVIDER_ERROR');
    expect(err.message).toMatch(/aborted/);
  });

  it('connection refused -> TF_AI_PROVIDER_ERROR without leaking the key', async () => {
    const p = createProvider(opts({ provider: 'anthropic', baseUrl: 'http://127.0.0.1:1' }));
    const err = await expectCode(p.complete(REQ), 'TF_AI_PROVIDER_ERROR');
    expect(JSON.stringify([err.message, err.hint, err.details])).not.toContain(KEY);
  });

  it('error bodies echoing the api key are scrubbed (all providers)', async () => {
    handler = (_req, res) => json(res, 400, { error: `invalid key ${KEY} supplied` });
    for (const provider of ['anthropic', 'openai', 'gemini'] as const) {
      const err = await expectCode(createProvider(opts({ provider })).complete(REQ), 'TF_AI_PROVIDER_ERROR');
      expect(err.message).not.toContain(KEY);
      expect(err.message).toContain('***');
      expect(String(err.stack)).not.toContain(KEY);
    }
  });
});

describe('configuration errors', () => {
  it.each(['anthropic', 'openai', 'gemini'] as const)('%s without api key -> TF_AI_NOT_CONFIGURED', (provider) => {
    try {
      createProvider(resolveAiOptions({ provider }));
      expect.unreachable();
    } catch (e) {
      expect((e as TestFlyError).code).toBe('TF_AI_NOT_CONFIGURED');
      expect((e as TestFlyError).hint).toMatch(/API_KEY/);
    }
  });

  it('uses provider specific env var', () => {
    process.env.ANTHROPIC_API_KEY = 'env-anthropic-1';
    expect(createProvider(resolveAiOptions({ provider: 'anthropic' })).name).toBe('anthropic');
    process.env.GOOGLE_API_KEY = 'env-google-1';
    expect(createProvider(resolveAiOptions({ provider: 'gemini' })).name).toBe('gemini');
  });

  it('unknown provider -> TF_AI_NOT_CONFIGURED listing known providers', () => {
    try {
      createProvider(resolveAiOptions({ provider: 'nope' as never }));
      expect.unreachable();
    } catch (e) {
      expect((e as TestFlyError).code).toBe('TF_AI_NOT_CONFIGURED');
      expect((e as TestFlyError).hint).toMatch(/anthropic/);
    }
  });

  it('registerProvider adds a custom provider and can override built-ins', async () => {
    const custom: LlmProvider = { name: 'inhouse', complete: async () => ({ text: 'custom', model: 'm' }) };
    let seen: unknown;
    registerProvider('inhouse', (o) => ((seen = o), custom));
    const p = createProvider(resolveAiOptions({ provider: 'inhouse' as never, model: 'zzz' }));
    expect((await p.complete(REQ)).text).toBe('custom');
    expect((seen as { model: string }).model).toBe('zzz');
  });
});
