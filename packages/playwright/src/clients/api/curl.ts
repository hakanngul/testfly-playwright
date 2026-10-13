const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie)$|api[-_]?key|token|secret|signature/i;
const SENSITIVE_PARAM = /api[-_]?key|token|secret|password|signature|access[-_]?key/i;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Replace secret values in a header map with `***`. @internal */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k] = SENSITIVE_HEADER.test(k) ? '***' : v;
  return out;
}

/** Replace secret query-string values in a URL with `***`. @internal */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_PARAM.test(key)) u.searchParams.set(key, '***');
    }
    return u.toString().replace(/%2A%2A%2A/g, '***');
  } catch {
    return url;
  }
}

/** Build a copy-pasteable curl command with secrets redacted. @internal */
export function buildCurl(method: string, url: string, headers: Record<string, string>, body?: string): string {
  const parts = ['curl', '-X', method.toUpperCase(), shellQuote(redactUrl(url))];
  for (const [k, v] of Object.entries(redactHeaders(headers))) parts.push('-H', shellQuote(`${k}: ${v}`));
  if (body !== undefined && body !== '') parts.push('--data-raw', shellQuote(body));
  return parts.join(' ');
}

/** Truncate a string for logs. @internal */
export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}… [truncated ${value.length - max} chars]` : value;
}
