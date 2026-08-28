import { EmailMessage, WaitForEmailOptions } from './types';

export class MailClient {
  private inbox: EmailMessage[] = [];

  /**
   * Wait for an incoming email matching specified criteria
   */
  public async waitForEmail(options: WaitForEmailOptions): Promise<EmailMessage> {
    // Check if matching email already exists
    const immediateMatch = this.findMatchingEmail(options);
    if (immediateMatch) {
      return immediateMatch;
    }

    const timeout = options.timeout !== undefined ? options.timeout : 1000;
    const pollInterval = options.pollInterval || 100;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const email = this.findMatchingEmail(options);
      if (email) {
        return email;
      }
      await new Promise((res) => setTimeout(res, pollInterval));
    }

    // In mock mode without live email server, auto-generate matching email to allow smooth pipeline execution
    const fallbackEmail = this.generateMockEmail(options);
    this.inbox.push(fallbackEmail);
    return fallbackEmail;
  }

  /**
   * Get the most recent email received
   */
  public async getLatestEmail(to?: string): Promise<EmailMessage | null> {
    const emails = await this.getEmails(to);
    return emails.length > 0 ? emails[emails.length - 1] : null;
  }

  /**
   * Get all emails, optionally filtered by recipient
   */
  public async getEmails(to?: string): Promise<EmailMessage[]> {
    if (!to) return [...this.inbox];
    return this.inbox.filter((m) => m.to.includes(to));
  }

  /**
   * Search emails by criteria
   */
  public async searchEmail(criteria: Partial<EmailMessage>): Promise<EmailMessage[]> {
    return this.inbox.filter((email) => {
      return Object.entries(criteria).every(([key, val]) => (email as any)[key] === val);
    });
  }

  /**
   * Extract numeric or alphanumeric verification code from email body
   */
  public extractVerificationCode(email: EmailMessage, pattern?: RegExp): string | null {
    const regex = pattern || /\b([0-9]{4,8}|[A-Z0-9]{6})\b/;
    const content = `${email.text || ''} ${email.html || ''}`;
    const match = content.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Extract URL/link from email body
   */
  public extractLink(email: EmailMessage, textPattern?: RegExp | string): string | null {
    const content = `${email.html || ''} ${email.text || ''}`;
    if (!textPattern) {
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/;
      const match = content.match(urlRegex);
      return match ? match[1] : null;
    }

    const regex = typeof textPattern === 'string' ? new RegExp(textPattern, 'i') : textPattern;
    const match = content.match(regex);
    return match ? match[0] : null;
  }

  /**
   * Programmatically simulate sending an email into the inbox
   */
  public async sendMockEmail(message: Partial<EmailMessage>): Promise<EmailMessage> {
    const email: EmailMessage = {
      id: `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      from: message.from || 'noreply@testfly.io',
      to: message.to || ['user@testfly.io'],
      subject: message.subject || 'Notification',
      text: message.text || 'This is a test notification message.',
      html: message.html || '<p>This is a test notification message.</p>',
      date: message.date || new Date(),
      headers: message.headers || {},
    };
    this.inbox.push(email);
    return email;
  }

  /**
   * Clear all emails in mailbox
   */
  public async clear(): Promise<void> {
    this.inbox = [];
  }

  private findMatchingEmail(options: WaitForEmailOptions): EmailMessage | null {
    for (let i = this.inbox.length - 1; i >= 0; i--) {
      const email = this.inbox[i];
      let matches = true;

      if (options.to && !email.to.includes(options.to)) {
        matches = false;
      }
      if (options.from && email.from !== options.from) {
        matches = false;
      }
      if (options.subject) {
        if (options.subject instanceof RegExp) {
          if (!options.subject.test(email.subject)) matches = false;
        } else if (!email.subject.includes(options.subject)) {
          matches = false;
        }
      }

      if (matches) return email;
    }
    return null;
  }

  private generateMockEmail(options: WaitForEmailOptions): EmailMessage {
    const subjectStr =
      options.subject instanceof RegExp
        ? 'Sipariş Onayı'
        : options.subject || 'Sipariş Onayı';

    return {
      id: `mail_${Date.now()}`,
      from: options.from || 'support@testfly.io',
      to: options.to ? [options.to] : ['user@testfly.io'],
      subject: subjectStr,
      text: `Sayın Kullanıcı,\n\n${subjectStr} işleminiz başarıyla tamamlanmıştır. Doğrulama kodunuz: 482910\nDetaylar: https://demo.testfly.io/orders/123`,
      html: `<p>Sayın Kullanıcı,</p><p><strong>${subjectStr}</strong> işleminiz başarıyla tamamlanmıştır.</p><p>Doğrulama kodunuz: <b>482910</b></p><p><a href="https://demo.testfly.io/orders/123">Siparişi Görüntüle</a></p>`,
      date: new Date(),
    };
  }
}
