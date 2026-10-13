import type { EmailMessage, MailCriteria } from './types';

/** Convert HTML to rough plain text (good enough for code/link extraction). @internal */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function bodyText(m: EmailMessage): string {
  return m.text && m.text.trim() ? m.text : m.html ? htmlToText(m.html) : '';
}

/** @public */
export interface ExtractCodeOptions {
  /** Exact digit count (default: 4 to 8 digits). */
  length?: number;
  /** Custom regex; capture group 1 is returned when present, else the whole match. */
  pattern?: RegExp;
}

/** Extract a verification code from the message body; `null` when none is found. @public */
export function extractCode(message: EmailMessage, opts: ExtractCodeOptions = {}): string | null {
  const re = opts.pattern ?? new RegExp(opts.length ? `(?<![\\d])(\\d{${opts.length}})(?![\\d])` : '(?<![\\d])(\\d{4,8})(?![\\d])');
  const m = re.exec(bodyText(message));
  if (!m) return null;
  return m[1] ?? m[0];
}

/** Extract http(s) links (href attributes and bare URLs), de-duplicated, in order. @public */
export function extractLinks(message: EmailMessage, filter?: string | RegExp | ((url: string) => boolean)): string[] {
  const links: string[] = [];
  const add = (raw: string): void => {
    const url = decodeEntities(raw).replace(/[.,;)]+$/, '');
    if (!links.includes(url)) links.push(url);
  };
  if (message.html) for (const m of message.html.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) add(m[1]);
  for (const m of bodyText(message).matchAll(/https?:\/\/[^\s"'<>]+/g)) add(m[0]);
  if (!filter) return links;
  const test = typeof filter === 'function' ? filter : typeof filter === 'string' ? (u: string) => u.includes(filter) : (u: string) => filter.test(u);
  return links.filter(test);
}

function matchText(value: string, pattern: string | RegExp): boolean {
  return typeof pattern === 'string' ? value.toLowerCase().includes(pattern.toLowerCase()) : new RegExp(pattern.source, pattern.flags.replace('g', '')).test(value);
}

/** @internal */
export function matchesCriteria(m: EmailMessage, c: MailCriteria): boolean {
  if (c.to && !m.to.some((t) => t.toLowerCase() === c.to!.toLowerCase())) return false;
  if (c.from && !m.from.toLowerCase().includes(c.from.toLowerCase())) return false;
  if (c.subject && !matchText(m.subject, c.subject)) return false;
  if (c.contains && !matchText(`${m.text ?? ''}\n${m.html ?? ''}`, c.contains)) return false;
  if (c.since && m.date.getTime() < c.since.getTime()) return false;
  return true;
}

/** Human readable criteria for error messages. @internal */
export function describeCriteria(c: MailCriteria): string {
  const parts = Object.entries(c)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v instanceof Date ? v.toISOString() : String(v)}`);
  return parts.length ? parts.join(', ') : '(any mail)';
}
