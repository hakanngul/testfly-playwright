import type { EmailMessage, MailProvider } from '../types';

/** Input for {@link MockMail.deliver}. @public */
export interface MockMailInput {
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  id?: string;
  date?: Date;
}

/**
 * EXPLICIT mock mailbox (`mail.provider: 'mock'`). It contains only what you deliver with `deliver()`;
 * `waitForEmail` on it never invents a message.
 *
 * @public
 */
export class MockMail implements MailProvider {
  readonly name = 'mock';
  private messages: EmailMessage[] = [];
  private seq = 0;

  /** Put a message in the mailbox. */
  deliver(input: MockMailInput): EmailMessage {
    const msg: EmailMessage = {
      id: input.id ?? `mock-${++this.seq}`,
      from: input.from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      date: input.date ?? new Date(),
    };
    this.messages.push(msg);
    return msg;
  }

  async list(): Promise<EmailMessage[]> {
    return [...this.messages];
  }

  async clear(): Promise<void> {
    this.messages = [];
  }
}
