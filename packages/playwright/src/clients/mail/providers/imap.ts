import { TestFlyError, importOptional } from '../../../core/errors';
import type { MailOptions } from '../../../core/config/schema';
import type { EmailMessage, MailProvider } from '../types';
import { parseMime } from './mime';

/* eslint-disable @typescript-eslint/no-explicit-any -- imapflow is an optional peer without bundled types */

/** IMAP provider backed by `imapflow`. Reads the newest 50 messages of the mailbox. @internal */
export class ImapProvider implements MailProvider {
  readonly name = 'imap';
  private constructor(
    private readonly client: any,
    private readonly mailbox: string,
  ) {}

  static async connect(options: MailOptions): Promise<ImapProvider> {
    if (!options.imap) {
      throw new TestFlyError('TF_MAIL_NOT_CONFIGURED', 'mail.imap is required for the imap provider.', {
        hint: 'Set testfly.mail.imap = { host, user, pass }.',
      });
    }
    const mod: any = await importOptional('imapflow', 'The imap mail provider');
    const ImapFlow = mod.ImapFlow ?? mod.default?.ImapFlow ?? mod.default;
    const { host, port, secure, user, pass, mailbox } = options.imap;
    const client = new ImapFlow({ host, port, secure, auth: { user, pass }, logger: false });
    client.on('error', () => undefined);
    try {
      await client.connect();
    } catch (cause) {
      throw new TestFlyError('TF_MAIL_PROVIDER_ERROR', `imap: could not connect to ${host}:${port}.`, { cause });
    }
    return new ImapProvider(client, mailbox);
  }

  async list(): Promise<EmailMessage[]> {
    const out: EmailMessage[] = [];
    let lock: any;
    try {
      lock = await this.client.getMailboxLock(this.mailbox);
      const exists: number = this.client.mailbox.exists;
      if (exists === 0) return out;
      const range = `${Math.max(1, exists - 49)}:*`;
      for await (const m of this.client.fetch(range, { uid: true, envelope: true, source: true, internalDate: true })) {
        const env = m.envelope ?? {};
        const parsed = parseMime(m.source.toString('latin1'));
        out.push({
          id: String(m.uid),
          from: env.from?.[0]?.address ?? '',
          to: [...(env.to ?? []), ...(env.cc ?? [])].map((a: any) => a.address).filter(Boolean),
          subject: env.subject ?? '',
          text: parsed.text,
          html: parsed.html,
          date: new Date(env.date ?? m.internalDate ?? Date.now()),
        });
      }
    } catch (cause) {
      throw new TestFlyError('TF_MAIL_PROVIDER_ERROR', `imap: reading ${this.mailbox} failed: ${(cause as Error).message}`, { cause });
    } finally {
      lock?.release();
    }
    return out;
  }

  async clear(): Promise<void> {
    let lock: any;
    try {
      lock = await this.client.getMailboxLock(this.mailbox);
      if (this.client.mailbox.exists > 0) await this.client.messageDelete('1:*');
    } catch (cause) {
      throw new TestFlyError('TF_MAIL_PROVIDER_ERROR', `imap: clearing ${this.mailbox} failed: ${(cause as Error).message}`, { cause });
    } finally {
      lock?.release();
    }
  }

  async close(): Promise<void> {
    await this.client.logout().catch(() => undefined);
  }
}
