import { describe, it, expect, beforeEach } from 'vitest';
import { MailClient } from '../src/clients/mail/MailClient';


describe('MailClient', () => {
  let mail: MailClient;

  beforeEach(() => {
    mail = new MailClient();
  });

  it('should send and retrieve mock emails', async () => {
    await mail.sendMockEmail({
      to: ['user@example.com'],
      subject: 'Welcome to TestFly',
      text: 'Your code is 123456',
    });

    const email = await mail.getLatestEmail('user@example.com');
    expect(email).not.toBeNull();
    expect(email?.subject).toBe('Welcome to TestFly');
  });

  it('should extract verification codes correctly', async () => {
    const email = await mail.sendMockEmail({
      to: ['auth@example.com'],
      subject: 'Security Code',
      text: 'Use code 892314 to log in.',
    });

    const code = mail.extractVerificationCode(email);
    expect(code).toBe('892314');
  });

  it('should extract URL links from email body', async () => {
    const email = await mail.sendMockEmail({
      to: ['confirm@example.com'],
      subject: 'Confirm Account',
      html: '<p>Click <a href="https://example.com/verify?token=xyz">here</a></p>',
    });

    const link = mail.extractLink(email);
    expect(link).toBe('https://example.com/verify?token=xyz');
  });

  it('should wait for email matching pattern', async () => {
    const emailPromise = mail.waitForEmail({ subject: /Sipariş Onayı/ });
    const email = await emailPromise;
    expect(email).toBeDefined();
    expect(email.subject).toContain('Sipariş Onayı');
  });
});
