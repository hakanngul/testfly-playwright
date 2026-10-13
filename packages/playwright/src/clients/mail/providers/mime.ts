/** Minimal MIME reader (text/plain + text/html parts) so IMAP needs no extra dependency. @internal */
export interface ParsedMime {
  text: string;
  html?: string;
}

function splitHeaders(raw: string): { headers: Record<string, string>; body: string } {
  const idx = raw.search(/\r?\n\r?\n/);
  const head = idx < 0 ? raw : raw.slice(0, idx);
  const body = idx < 0 ? '' : raw.slice(idx).replace(/^\r?\n\r?\n/, '');
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const c = line.indexOf(':');
    if (c > 0) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim();
  }
  return { headers, body };
}

function decodeBody(body: string, encoding: string | undefined, charset: string | undefined): string {
  const enc = (encoding ?? '').toLowerCase();
  let buf: Buffer;
  if (enc === 'base64') buf = Buffer.from(body.replace(/\s+/g, ''), 'base64');
  else if (enc === 'quoted-printable') {
    const s = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    buf = Buffer.from(s, 'latin1');
  } else buf = Buffer.from(body, 'latin1');
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

/** @internal */
export function parseMime(raw: string): ParsedMime {
  const result: ParsedMime = { text: '' };
  const walk = (part: string): void => {
    const { headers, body } = splitHeaders(part);
    const type = (headers['content-type'] ?? 'text/plain').toLowerCase();
    const boundary = /boundary="?([^";]+)"?/i.exec(headers['content-type'] ?? '')?.[1];
    if (type.startsWith('multipart/') && boundary) {
      for (const sub of body.split(`--${boundary}`).slice(1)) {
        if (sub.startsWith('--')) break;
        walk(sub.replace(/^\r?\n/, ''));
      }
      return;
    }
    const charset = /charset="?([^";]+)"?/i.exec(headers['content-type'] ?? '')?.[1];
    const decoded = decodeBody(body, headers['content-transfer-encoding'], charset);
    if (type.startsWith('text/html')) result.html ??= decoded;
    else if (type.startsWith('text/plain')) result.text ||= decoded;
  };
  walk(raw);
  return result;
}
