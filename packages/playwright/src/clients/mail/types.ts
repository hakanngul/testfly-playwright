/** A received email. @public */
export interface EmailMessage {
  id: string;
  /** Sender address. */
  from: string;
  /** Recipient addresses. */
  to: string[];
  subject: string;
  text: string;
  html?: string;
  date: Date;
}

/** Filter used by `list`, `latest` and `waitForEmail`. @public */
export interface MailCriteria {
  /** Matches when any recipient equals this address (case-insensitive). */
  to?: string;
  /** Matches when the sender address contains this text (case-insensitive). */
  from?: string;
  subject?: string | RegExp;
  /** Text or regex that must appear in the text or html body. */
  contains?: string | RegExp;
  /** Only mails received at or after this date. */
  since?: Date;
}

/** @public */
export interface WaitForEmailOptions extends MailCriteria {
  /** Max wait in ms (default: configured poll timeout). */
  timeout?: number;
  /** Poll interval in ms (default: configured poll interval). */
  pollInterval?: number;
}

/** Backend of a {@link MailClient}. @internal */
export interface MailProvider {
  readonly name: string;
  /** All messages currently in the mailbox (bodies included). */
  list(): Promise<EmailMessage[]>;
  /** Delete all messages. */
  clear(): Promise<void>;
  close?(): Promise<void>;
}
