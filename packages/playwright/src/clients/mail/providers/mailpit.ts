import { TestFlyError } from '../../../core/errors';
import type { EmailMessage, MailProvider } from '../types';
import { providerFetch } from './http';

interface MpAddress {
  Name?: string;
  Address: string;
}
interface MpSummary {
  ID: string;
}
interface MpDetail {
  ID: string;
  From: MpAddress | null;
  To: MpAddress[] | null;
  Subject: string;
  Date: string;
  Text?: string;
  HTML?: string;
}

/** Mailpit / MailHog-v2-compatible HTTP API provider. @internal */
export class MailpitProvider implements MailProvider {
  readonly name = 'mailpit';
  private readonly base: string;
  private readonly cache = new Map<string, EmailMessage>();

  constructor(url: string | undefined) {
    if (!url) {
      throw new TestFlyError('TF_MAIL_NOT_CONFIGURED', 'mail.url is required for the mailpit provider.', {
        hint: 'Set testfly.mail.url, e.g. http://localhost:8025.',
      });
    }
    this.base = url.replace(/\/+$/, '');
  }

  async list(): Promise<EmailMessage[]> {
    const res = await providerFetch(this.name, `${this.base}/api/v1/messages?limit=200`);
    const body = (await res.json()) as { messages?: Array<MpSummary & { ID: string }>; Messages?: MpSummary[] };
    const summaries = body.messages ?? body.Messages ?? [];
    const out: EmailMessage[] = [];
    for (const s of summaries) {
      let msg = this.cache.get(s.ID);
      if (!msg) {
        const d = (await (await providerFetch(this.name, `${this.base}/api/v1/message/${encodeURIComponent(s.ID)}`)).json()) as MpDetail;
        msg = {
          id: d.ID,
          from: d.From?.Address ?? '',
          to: (d.To ?? []).map((a) => a.Address),
          subject: d.Subject ?? '',
          text: d.Text ?? '',
          html: d.HTML || undefined,
          date: new Date(d.Date),
        };
        this.cache.set(s.ID, msg);
      }
      out.push(msg);
    }
    return out;
  }

  async clear(): Promise<void> {
    await providerFetch(this.name, `${this.base}/api/v1/messages`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' });
    this.cache.clear();
  }
}
