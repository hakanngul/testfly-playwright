import { TestFlyError } from '../../../core/errors';
import type { EmailMessage, MailProvider } from '../types';
import { providerFetch } from './http';

interface MtMessage {
  id: number;
  subject: string;
  from_email: string;
  to_email: string;
  created_at: string;
}

/** Mailtrap Sandbox API provider (apiKey + accountId + inboxId). @internal */
export class MailtrapProvider implements MailProvider {
  readonly name = 'mailtrap';
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly cache = new Map<number, EmailMessage>();

  constructor(opts: { url?: string; apiKey?: string; accountId?: string; inboxId?: string }) {
    const missing = (['apiKey', 'accountId', 'inboxId'] as const).filter((k) => !opts[k]);
    if (missing.length) {
      throw new TestFlyError('TF_MAIL_NOT_CONFIGURED', `The mailtrap provider needs mail.${missing.join(', mail.')}.`, {
        hint: 'Find them in Mailtrap → Settings → API Tokens and in the inbox URL.',
      });
    }
    this.base = `${(opts.url ?? 'https://mailtrap.io').replace(/\/+$/, '')}/api/accounts/${opts.accountId}/inboxes/${opts.inboxId}`;
    this.headers = { 'Api-Token': opts.apiKey!, accept: 'application/json' };
  }

  async list(): Promise<EmailMessage[]> {
    const res = await providerFetch(this.name, `${this.base}/messages`, { headers: this.headers });
    const items = (await res.json()) as MtMessage[];
    const out: EmailMessage[] = [];
    for (const m of items) {
      let msg = this.cache.get(m.id);
      if (!msg) {
        const [text, html] = await Promise.all([this.body(m.id, 'txt'), this.body(m.id, 'html')]);
        msg = { id: String(m.id), from: m.from_email, to: [m.to_email], subject: m.subject, text, html: html || undefined, date: new Date(m.created_at) };
        this.cache.set(m.id, msg);
      }
      out.push(msg);
    }
    return out;
  }

  private async body(id: number, kind: 'txt' | 'html'): Promise<string> {
    try {
      return await (await providerFetch(this.name, `${this.base}/messages/${id}/body.${kind}`, { headers: this.headers })).text();
    } catch (err) {
      // A message may have no txt or html part (404); other failures are real errors.
      if (err instanceof TestFlyError && err.details?.status === 404) return '';
      throw err;
    }
  }

  async clear(): Promise<void> {
    await providerFetch(this.name, `${this.base}/clean`, { method: 'PATCH', headers: this.headers });
    this.cache.clear();
  }
}
