import type { AuthStrategy } from './types';

/** `Authorization: Bearer <token>`; token may be a function for lazily resolved tokens. @public */
export function bearerAuth(token: string | (() => string | Promise<string>)): AuthStrategy {
  return {
    name: 'bearer',
    async apply(req) {
      req.headers['authorization'] = `Bearer ${typeof token === 'function' ? await token() : token}`;
    },
  };
}

/** HTTP Basic authentication. @public */
export function basicAuth(username: string, password: string): AuthStrategy {
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return {
    name: 'basic',
    apply(req) {
      req.headers['authorization'] = `Basic ${encoded}`;
    },
  };
}

/** API key sent in a header or in the query string. @public */
export function apiKeyAuth(name: string, value: string, location: 'header' | 'query' = 'header'): AuthStrategy {
  return {
    name: 'apiKey',
    apply(req) {
      if (location === 'header') req.headers[name.toLowerCase()] = value;
      else req.url.searchParams.set(name, value);
    },
  };
}
