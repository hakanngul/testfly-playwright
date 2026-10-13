import { TestFlyError } from '../../core/errors';
import type { MailOptions } from '../../core/config/schema';
import { describeCriteria, extractCode, extractLinks, matchesCriteria, type ExtractCodeOptions } from './extract';
import { ImapProvider } from './providers/imap';
import { MailpitProvider } from './providers/mailpit';
import { MailtrapProvider } from './providers/mailtrap';
import { MockMail } from './providers/mock';
import type { EmailMessage, MailCriteria, MailProvider, WaitForEmailOptions } from './types';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Mail client for verifying emails sent by the application under test.
 * Providers: `mailpit`, `mailtrap`, `imap`, and the explicit `mock` (only mails you `deliver`).
 *
 * @public
 */
export class MailClient {
  /** Present only for `provider: 'mock'`. */
  readonly mock?: MockMail;

  private constructor(
    private readonly provider: MailProvider,
    private readonly timeouts: { poll: number; pollInterval: number },
  ) {
    this.mock = provider instanceof MockMail ? provider : undefined;
  }

  static async create(options: MailOptions, timeouts: { poll: number; pollInterval: number }): Promise<MailClient> {
    let provider: MailProvider;
    switch (options.provider) {
      case 'mailpit':
        provider = new MailpitProvider(options.url);
        break;
      case 'mailtrap':
        provider = new MailtrapProvider(options);
        break;
      case 'imap':
        provider = await ImapProvider.connect(options);
        break;
      case 'mock':
        provider = new MockMail();
        break;
    }
    return new MailClient(provider, timeouts);
  }

  async close(): Promise<void> {
    await this.provider.close?.();
  }

  /** Messages matching `criteria`, newest first. */
  async list(criteria: MailCriteria = {}): Promise<EmailMessage[]> {
    const all = await this.provider.list();
    return all.filter((m) => matchesCriteria(m, criteria)).sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /** Newest message (optionally for one recipient), or `undefined`. */
  async latest(to?: string): Promise<EmailMessage | undefined> {
    return (await this.list(to ? { to } : {}))[0];
  }

  /**
   * Poll the provider until a message matches; returns the newest match.
   * Throws `TF_MAIL_TIMEOUT` (criteria + number of mails seen) — never fabricates a message.
   */
  async waitForEmail(options: WaitForEmailOptions = {}): Promise<EmailMessage> {
    const { timeout = this.timeouts.poll, pollInterval = this.timeouts.pollInterval, ...criteria } = options;
    const deadline = Date.now() + timeout;
    let seen = 0;
    for (;;) {
      const all = await this.provider.list();
      seen = all.length;
      const hit = all.filter((m) => matchesCriteria(m, criteria)).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
      if (hit) return hit;
      if (Date.now() + pollInterval > deadline) break;
      await sleep(pollInterval);
    }
    throw new TestFlyError('TF_MAIL_TIMEOUT', `No email matched [${describeCriteria(criteria)}] within ${timeout}ms (${seen} email(s) seen in the ${this.provider.name} mailbox).`, {
      hint: this.provider.name === 'mock' ? 'With the mock provider only mails passed to mail.mock.deliver() exist.' : 'Check the recipient address, the criteria and that the app can reach the mail server.',
      details: { provider: this.provider.name, seen, timeout },
    });
  }

  /** Extract a verification code from a message (`null` if none). */
  extractCode(message: EmailMessage, opts?: ExtractCodeOptions): string | null {
    return extractCode(message, opts);
  }

  /** Extract http(s) links from a message, optionally filtered. */
  extractLinks(message: EmailMessage, filter?: string | RegExp | ((url: string) => boolean)): string[] {
    return extractLinks(message, filter);
  }

  /** Delete all messages (supported by every provider). */
  async clear(): Promise<void> {
    await this.provider.clear();
  }
}
