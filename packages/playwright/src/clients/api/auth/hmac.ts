import { createHash, createHmac } from 'node:crypto';
import type { AuthStrategy } from './types';

/** @public */
export interface HmacSignerOptions {
  keyId: string;
  secret: string;
  /** Hash algorithm (default `sha256`). */
  algorithm?: 'sha256' | 'sha384' | 'sha512' | 'sha1';
  /** Signature encoding (default `hex`). */
  encoding?: 'hex' | 'base64';
  /** Header names (defaults: x-key-id, x-timestamp, x-content-sha256, x-signature). */
  headers?: { keyId?: string; timestamp?: string; contentSha256?: string; signature?: string };
  /** Timestamp source, in unix seconds (override for deterministic tests). */
  now?: () => number;
}

/**
 * HMAC request signing. The signed string is:
 *
 * `METHOD \n path+query \n timestamp \n sha256-hex(body)`
 *
 * and the signature is `HMAC(secret, signedString)` sent in the signature header.
 *
 * @public
 */
export function hmacSigner(opts: HmacSignerOptions): AuthStrategy {
  const algorithm = opts.algorithm ?? 'sha256';
  const encoding = opts.encoding ?? 'hex';
  const names = {
    keyId: opts.headers?.keyId ?? 'x-key-id',
    timestamp: opts.headers?.timestamp ?? 'x-timestamp',
    contentSha256: opts.headers?.contentSha256 ?? 'x-content-sha256',
    signature: opts.headers?.signature ?? 'x-signature',
  };
  return {
    name: 'hmac',
    apply(req) {
      const timestamp = String(Math.floor((opts.now?.() ?? Date.now() / 1000)));
      const bodyHash = createHash('sha256')
        .update(req.body ?? '')
        .digest('hex');
      const toSign = [req.method.toUpperCase(), req.url.pathname + req.url.search, timestamp, bodyHash].join('\n');
      const signature = createHmac(algorithm, opts.secret).update(toSign).digest(encoding);
      req.headers[names.keyId.toLowerCase()] = opts.keyId;
      req.headers[names.timestamp.toLowerCase()] = timestamp;
      req.headers[names.contentSha256.toLowerCase()] = bodyHash;
      req.headers[names.signature.toLowerCase()] = signature;
    },
  };
}
