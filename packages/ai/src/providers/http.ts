import { TestFlyError } from '@testfly/playwright';

/** @internal */
export function providerError(provider: string, message: string, cause?: unknown, hint?: string): TestFlyError {
  return new TestFlyError('TF_AI_PROVIDER_ERROR', `${provider}: ${message}`, { cause, hint });
}

/** Remove every secret literal from a string (defence in depth: error bodies must never leak keys). */
function scrub(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join('***');
  return out;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });
}

function retryDelayMs(res: Response): number {
  const raw = res.headers.get('retry-after');
  if (raw) {
    const secs = Number(raw);
    if (Number.isFinite(secs)) return Math.min(Math.max(secs, 0) * 1000, 15_000);
    const date = Date.parse(raw);
    if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 15_000);
  }
  return 800;
}

/** @internal */
export interface PostJsonOptions {
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Literal secrets to scrub from error messages. */
  secrets: string[];
}

/**
 * POST JSON with a timeout and ONE retry on 429/5xx (honouring `retry-after`).
 * Never includes headers (API keys) in thrown errors.
 *
 * @internal
 */
export async function postJson(opts: PostJsonOptions): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = AbortSignal.timeout(opts.timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await fetch(opts.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...opts.headers },
        body: JSON.stringify(opts.body),
        signal,
      });
    } catch (cause) {
      if (timeout.aborted) {
        throw providerError(opts.provider, `request timed out after ${opts.timeoutMs}ms`, cause, 'Increase testfly.ai.timeoutMs or check connectivity.');
      }
      if (opts.signal?.aborted) throw providerError(opts.provider, 'request aborted', cause);
      const msg = scrub(cause instanceof Error ? cause.message : String(cause), opts.secrets);
      throw providerError(opts.provider, `network error: ${msg}`, undefined, 'Check connectivity and testfly.ai.baseUrl.');
    }
    if (res.ok) {
      try {
        return await res.json();
      } catch (cause) {
        throw providerError(opts.provider, 'response was not valid JSON', cause);
      }
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt === 0) {
      await res.body?.cancel().catch(() => undefined);
      await sleep(retryDelayMs(res), opts.signal);
      continue;
    }
    let detail = '';
    try {
      detail = scrub((await res.text()).slice(0, 500), opts.secrets);
    } catch {
      /* ignore */
    }
    const hint =
      res.status === 401 || res.status === 403
        ? 'The API key was rejected. Check testfly.ai.apiKey / the provider environment variable.'
        : res.status === 429
          ? 'Rate limited by the provider. Lower parallelism or use ai.mode="replay" with committed caches.'
          : undefined;
    throw providerError(opts.provider, `HTTP ${res.status}${detail ? ` – ${detail}` : ''}`, undefined, hint);
  }
  /* c8 ignore next */
  throw providerError(opts.provider, 'request failed');
}

/** Normalise a base URL (strip trailing slashes). @internal */
export function trimUrl(url: string): string {
  return url.replace(/\/+$/, '');
}
