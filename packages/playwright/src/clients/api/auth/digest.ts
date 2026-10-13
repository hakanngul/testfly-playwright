import { createHash, randomBytes } from 'node:crypto';
import type { AuthStrategy, PreparedRequest } from './types';

interface Challenge {
  realm: string;
  nonce: string;
  opaque?: string;
  algorithm: 'MD5' | 'SHA-256';
  qop?: string;
}

function parseChallenge(header: string): Challenge | undefined {
  const m = /^\s*digest\s+(.*)$/i.exec(header);
  if (!m) return undefined;
  const params: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]*))/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(m[1])) !== null) params[r[1].toLowerCase()] = r[2] ?? r[3];
  if (!params.nonce) return undefined;
  const alg = (params.algorithm ?? 'MD5').toUpperCase().replace('-SESS', '');
  const qops = (params.qop ?? '').split(',').map((s) => s.trim());
  return {
    realm: params.realm ?? '',
    nonce: params.nonce,
    opaque: params.opaque,
    algorithm: alg === 'SHA-256' ? 'SHA-256' : 'MD5',
    qop: qops.includes('auth') ? 'auth' : undefined,
  };
}

/**
 * HTTP Digest authentication (RFC 7616, MD5 and SHA-256, `qop=auth`).
 * The first request goes out unauthenticated; on 401 the challenge is answered and the request retried once.
 *
 * @public
 */
export function digestAuth(username: string, password: string): AuthStrategy {
  let challenge: Challenge | undefined;
  let nc = 0;

  const hash = (alg: Challenge['algorithm'], s: string): string => createHash(alg === 'SHA-256' ? 'sha256' : 'md5').update(s).digest('hex');

  function authorize(req: PreparedRequest, c: Challenge): string {
    nc++;
    const ncStr = nc.toString(16).padStart(8, '0');
    const cnonce = randomBytes(8).toString('hex');
    const uri = req.url.pathname + req.url.search;
    const ha1 = hash(c.algorithm, `${username}:${c.realm}:${password}`);
    const bodyless = hash(c.algorithm, `${req.method.toUpperCase()}:${uri}`);
    const response = c.qop
      ? hash(c.algorithm, `${ha1}:${c.nonce}:${ncStr}:${cnonce}:${c.qop}:${bodyless}`)
      : hash(c.algorithm, `${ha1}:${c.nonce}:${bodyless}`);
    const parts = [
      `username="${username}"`,
      `realm="${c.realm}"`,
      `nonce="${c.nonce}"`,
      `uri="${uri}"`,
      `algorithm=${c.algorithm}`,
      `response="${response}"`,
    ];
    if (c.qop) parts.push(`qop=${c.qop}`, `nc=${ncStr}`, `cnonce="${cnonce}"`);
    if (c.opaque) parts.push(`opaque="${c.opaque}"`);
    return `Digest ${parts.join(', ')}`;
  }

  return {
    name: 'digest',
    apply(req) {
      if (challenge) req.headers['authorization'] = authorize(req, challenge);
    },
    handleChallenge(req, res) {
      const header = res.headers['www-authenticate'];
      const parsed = header ? parseChallenge(header) : undefined;
      if (!parsed) return false;
      challenge = parsed;
      nc = 0;
      req.headers['authorization'] = authorize(req, parsed);
      return true;
    },
  };
}
