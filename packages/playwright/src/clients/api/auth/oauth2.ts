import { TestFlyError } from '../../../core/errors';
import type { AuthStrategy } from './types';

interface CachedToken {
  accessToken: string;
  tokenType: string;
  /** epoch ms; Infinity when the server gave no expiry. */
  expiresAt: number;
  refreshToken?: string;
}

/** Shared across clients and tests inside one worker: keyed by tokenUrl + clientId (+ grant/user/scope). */
const tokenCache = new Map<string, CachedToken>();
const inflight = new Map<string, Promise<CachedToken>>();
const EXPIRY_SKEW_MS = 30_000;

/** Options common to OAuth2 grants. @public */
export interface OAuth2Options {
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  audience?: string;
  /** Send client credentials as Basic header (default) or in the form body. */
  clientAuth?: 'basic' | 'body';
  /** Extra form fields for the token request. */
  extraParams?: Record<string, string>;
}

/** @public */
export interface OAuth2PasswordOptions extends OAuth2Options {
  username: string;
  password: string;
}

/** Clear the OAuth2 token cache (mainly for tests). @public */
export function clearOAuth2Cache(): void {
  tokenCache.clear();
  inflight.clear();
}

async function requestToken(opts: OAuth2Options, form: Record<string, string>): Promise<CachedToken> {
  const body = new URLSearchParams(form);
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
  if (opts.clientSecret !== undefined && (opts.clientAuth ?? 'basic') === 'basic') {
    headers['authorization'] = `Basic ${Buffer.from(`${encodeURIComponent(opts.clientId)}:${encodeURIComponent(opts.clientSecret)}`).toString('base64')}`;
  } else {
    body.set('client_id', opts.clientId);
    if (opts.clientSecret !== undefined) body.set('client_secret', opts.clientSecret);
  }
  if (opts.scope) body.set('scope', opts.scope);
  if (opts.audience) body.set('audience', opts.audience);
  for (const [k, v] of Object.entries(opts.extraParams ?? {})) body.set(k, v);

  let res: Response;
  try {
    res = await fetch(opts.tokenUrl, { method: 'POST', headers, body });
  } catch (cause) {
    throw new TestFlyError('TF_API_REQUEST_FAILED', `OAuth2 token request to ${opts.tokenUrl} failed.`, { cause });
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* handled below */
  }
  if (!res.ok || typeof json.access_token !== 'string') {
    throw new TestFlyError('TF_API_REQUEST_FAILED', `OAuth2 token endpoint ${opts.tokenUrl} answered ${res.status} without an access_token.`, {
      details: { status: res.status },
    });
  }
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : Number(json.expires_in);
  return {
    accessToken: json.access_token,
    tokenType: typeof json.token_type === 'string' ? json.token_type : 'Bearer',
    expiresAt: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : Infinity,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
  };
}

function makeStrategy(name: string, opts: OAuth2Options, cacheKey: string, initialForm: () => Record<string, string>): AuthStrategy {
  async function getToken(forceRefresh: boolean): Promise<CachedToken> {
    const cached = tokenCache.get(cacheKey);
    if (cached && !forceRefresh && cached.expiresAt - EXPIRY_SKEW_MS > Date.now()) return cached;
    const pending = inflight.get(cacheKey);
    if (pending) return pending;
    const job = (async () => {
      // Prefer the refresh_token grant when we have one, fall back to a full re-fetch.
      if (cached?.refreshToken) {
        try {
          const refreshed = await requestToken(opts, { grant_type: 'refresh_token', refresh_token: cached.refreshToken });
          refreshed.refreshToken ??= cached.refreshToken;
          return refreshed;
        } catch {
          /* fall through to a fresh grant */
        }
      }
      return requestToken(opts, initialForm());
    })();
    inflight.set(cacheKey, job);
    try {
      const token = await job;
      tokenCache.set(cacheKey, token);
      return token;
    } finally {
      inflight.delete(cacheKey);
    }
  }

  return {
    name,
    async apply(req) {
      const t = await getToken(false);
      req.headers['authorization'] = `${t.tokenType.toLowerCase() === 'bearer' ? 'Bearer' : t.tokenType} ${t.accessToken}`;
    },
    async handleChallenge(req) {
      // The token may have been revoked server-side: force a refresh and retry once.
      const t = await getToken(true);
      req.headers['authorization'] = `Bearer ${t.accessToken}`;
      return true;
    },
  };
}

/** OAuth2 client-credentials grant with cached, auto-refreshed tokens. @public */
export function oauth2ClientCredentials(opts: OAuth2Options): AuthStrategy {
  return makeStrategy('oauth2-client-credentials', opts, `cc|${opts.tokenUrl}|${opts.clientId}|${opts.scope ?? ''}`, () => ({
    grant_type: 'client_credentials',
  }));
}

/** OAuth2 resource-owner password grant with cached, auto-refreshed tokens. @public */
export function oauth2Password(opts: OAuth2PasswordOptions): AuthStrategy {
  return makeStrategy('oauth2-password', opts, `pw|${opts.tokenUrl}|${opts.clientId}|${opts.username}|${opts.scope ?? ''}`, () => ({
    grant_type: 'password',
    username: opts.username,
    password: opts.password,
  }));
}
