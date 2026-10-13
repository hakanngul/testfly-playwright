import { describe, expect, it } from 'vitest';
import { MailClient, MockMail, extractCode, extractLinks, type EmailMessage } from '../../../src/clients/mail';
import { describeCriteria, htmlToText, matchesCriteria } from '../../../src/clients/mail/extract';
import { MailOptionsSchema } from '../../../src/core/config/schema';

const timeouts = { poll: 200, pollInterval: 10 };
const create = (opts: Record<string, unknown> = {}) => MailClient.create(MailOptionsSchema.parse({ provider: 'mock', ...opts }), timeouts);

const msg = (over: Partial<EmailMessage> = {}): EmailMessage => ({
  id: '1',
  from: 'noreply@shop.test',
  to: ['alice@example.com'],
  subject: 'Welcome',
  text: 'hello',
  date: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('MailClient with the mock provider', () => {
  it('exposes mock only for the mock provider and starts empty', async () => {
    const mail = await create();
    expect(mail.mock).toBeInstanceOf(MockMail);
    expect(await mail.list()).toEqual([]);
    expect(await mail.latest()).toBeUndefined();
  });

  it('deliver assigns ids, normalises recipients and defaults the date', async () => {
    const mail = await create();
    const a = mail.mock!.deliver({ from: 'a@x', to: 'b@x', subject: 's', text: 't' });
    const b = mail.mock!.deliver({ from: 'a@x', to: ['b@x', 'c@x'], subject: 's', text: 't', id: 'custom', html: '<p>h</p>' });
    expect(a.id).toBe('mock-1');
    expect(a.to).toEqual(['b@x']);
    expect(b.id).toBe('custom');
    expect(b.to).toEqual(['b@x', 'c@x']);
    expect(Math.abs(a.date.getTime() - Date.now())).toBeLessThan(5_000);
    expect(await mail.list()).toHaveLength(2);
  });

  it('list is newest first and latest(to) filters by recipient', async () => {
    const mail = await create();
    mail.mock!.deliver({ from: 'a@x', to: 'a@x', subject: 'old', text: '', date: new Date(1000) });
    mail.mock!.deliver({ from: 'a@x', to: 'b@x', subject: 'new', text: '', date: new Date(3000) });
    mail.mock!.deliver({ from: 'a@x', to: 'a@x', subject: 'mid', text: '', date: new Date(2000) });
    expect((await mail.list()).map((m) => m.subject)).toEqual(['new', 'mid', 'old']);
    expect((await mail.latest())!.subject).toBe('new');
    expect((await mail.latest('A@X'))!.subject).toBe('mid');
    expect(await mail.latest('nobody@x')).toBeUndefined();
  });

  it('clear empties the mailbox', async () => {
    const mail = await create();
    mail.mock!.deliver({ from: 'a', to: 'b', subject: 's', text: '' });
    await mail.clear();
    expect(await mail.list()).toEqual([]);
  });

  describe('waitForEmail matching', () => {
    const seed = async () => {
      const mail = await create();
      const d = mail.mock!.deliver.bind(mail.mock);
      d({ id: 'welcome', from: 'Shop <noreply@shop.test>', to: 'alice@example.com', subject: 'Welcome to Shop', text: 'Your code is 123456', date: new Date('2026-03-01T10:00:00Z') });
      d({ id: 'reset', from: 'security@bank.test', to: 'alice@example.com', subject: 'Reset your password', text: 'Click here', html: '<a href="https://x.test/reset?t=1">reset</a>', date: new Date('2026-03-02T10:00:00Z') });
      d({ id: 'bob', from: 'noreply@shop.test', to: ['bob@example.com', 'carol@example.com'], subject: 'Welcome to Shop', text: 'bob mail', date: new Date('2026-03-03T10:00:00Z') });
      return mail;
    };

    it('by recipient (case-insensitive exact, any recipient of several)', async () => {
      const mail = await seed();
      expect((await mail.waitForEmail({ to: 'ALICE@example.com', subject: /welcome/i })).id).toBe('welcome');
      expect((await mail.waitForEmail({ to: 'carol@example.com' })).id).toBe('bob');
      await expect(mail.waitForEmail({ to: 'alice', timeout: 30 })).rejects.toMatchObject({ code: 'TF_MAIL_TIMEOUT' }); // not a substring match
    });

    it('by sender substring (case-insensitive)', async () => {
      const mail = await seed();
      expect((await mail.waitForEmail({ from: 'BANK.TEST' })).id).toBe('reset');
    });

    it('by subject: string is a case-insensitive contains; regex is used as given', async () => {
      const mail = await seed();
      expect((await mail.waitForEmail({ subject: 'reset YOUR' })).id).toBe('reset');
      expect((await mail.waitForEmail({ subject: /^Reset/ })).id).toBe('reset');
      await expect(mail.waitForEmail({ subject: /^reset/, timeout: 30 })).rejects.toMatchObject({ code: 'TF_MAIL_TIMEOUT' });
    });

    it('a global regex does not suffer from lastIndex statefulness', async () => {
      const mail = await seed();
      const re = /welcome/gi;
      expect((await mail.waitForEmail({ subject: re, to: 'alice@example.com' })).id).toBe('welcome');
      expect((await mail.waitForEmail({ subject: re, to: 'alice@example.com' })).id).toBe('welcome');
      expect((await mail.waitForEmail({ subject: re, to: 'alice@example.com' })).id).toBe('welcome');
    });

    it('by contains in text or html (string and regex)', async () => {
      const mail = await seed();
      expect((await mail.waitForEmail({ contains: 'code is 123' })).id).toBe('welcome');
      expect((await mail.waitForEmail({ contains: /code is \d{6}/ })).id).toBe('welcome');
      expect((await mail.waitForEmail({ contains: 'x.test/reset' })).id).toBe('reset'); // html only
    });

    it('by since (inclusive)', async () => {
      const mail = await seed();
      expect((await mail.waitForEmail({ since: new Date('2026-03-03T10:00:00Z') })).id).toBe('bob');
      await expect(mail.waitForEmail({ since: new Date('2026-03-03T10:00:01Z'), timeout: 30 })).rejects.toMatchObject({ code: 'TF_MAIL_TIMEOUT' });
    });

    it('returns the newest of several matches', async () => {
      const mail = await seed();
      expect((await mail.waitForEmail({ subject: 'welcome' })).id).toBe('bob');
    });

    it('combines all criteria with AND', async () => {
      const mail = await seed();
      const hit = await mail.waitForEmail({ to: 'alice@example.com', from: 'shop.test', subject: 'welcome', contains: '123456', since: new Date('2026-01-01') });
      expect(hit.id).toBe('welcome');
      await expect(mail.waitForEmail({ to: 'alice@example.com', from: 'bank', subject: 'welcome', timeout: 30 })).rejects.toMatchObject({ code: 'TF_MAIL_TIMEOUT' });
    });

    it('picks up a mail delivered while waiting', async () => {
      const mail = await create();
      setTimeout(() => mail.mock!.deliver({ from: 'a', to: 'late@x', subject: 'late', text: '' }), 50);
      const hit = await mail.waitForEmail({ to: 'late@x', timeout: 2000, pollInterval: 10 });
      expect(hit.subject).toBe('late');
    });
  });

  describe('timeouts never fabricate a mail', () => {
    it('empty mailbox: TF_MAIL_TIMEOUT with criteria, count and mock hint', async () => {
      const mail = await create();
      const started = Date.now();
      const err = await mail.waitForEmail({ to: 'who@x', subject: /verify/i, contains: 'otp', timeout: 80, pollInterval: 10 }).catch((e) => e);
      expect(err.code).toBe('TF_MAIL_TIMEOUT');
      expect(err.message).toContain('to=who@x');
      expect(err.message).toContain('subject=/verify/i');
      expect(err.message).toContain('contains=otp');
      expect(err.message).toContain('80ms');
      expect(err.message).toContain('0 email(s) seen');
      expect(err.message).toContain('mock');
      expect(err.hint).toMatch(/mail\.mock\.deliver/);
      expect(err.details).toMatchObject({ provider: 'mock', seen: 0, timeout: 80 });
      expect(Date.now() - started).toBeGreaterThanOrEqual(70);
    });

    it('non-matching mails are counted but not returned', async () => {
      const mail = await create();
      mail.mock!.deliver({ from: 'a', to: 'x@x', subject: 'other', text: '' });
      mail.mock!.deliver({ from: 'a', to: 'y@x', subject: 'other', text: '' });
      const err = await mail.waitForEmail({ to: 'z@x', timeout: 40, pollInterval: 10 }).catch((e) => e);
      expect(err.code).toBe('TF_MAIL_TIMEOUT');
      expect(err.message).toContain('2 email(s) seen');
    });

    it('describes "(any mail)" for empty criteria, and ignores undefined fields', async () => {
      const mail = await create();
      const err = await mail.waitForEmail({ timeout: 20, pollInterval: 5, to: undefined }).catch((e) => e);
      expect(err.message).toContain('(any mail)');
    });

    it('defaults to the configured poll timeout', async () => {
      const mail = await MailClient.create(MailOptionsSchema.parse({ provider: 'mock' }), { poll: 60, pollInterval: 10 });
      const t0 = Date.now();
      const err = await mail.waitForEmail({ to: 'nobody@x' }).catch((e) => e);
      expect(err.message).toContain('60ms');
      expect(Date.now() - t0).toBeLessThan(1000);
    });

    it('with a zero timeout it checks exactly once', async () => {
      const mail = await create();
      mail.mock!.deliver({ from: 'a', to: 'x@x', subject: 's', text: '' });
      expect((await mail.waitForEmail({ to: 'x@x', timeout: 0 })).to).toEqual(['x@x']);
      await expect(mail.waitForEmail({ to: 'no@x', timeout: 0 })).rejects.toMatchObject({ code: 'TF_MAIL_TIMEOUT' });
    });
  });
});

describe('criteria helpers', () => {
  it('matchesCriteria with empty criteria matches everything', () => expect(matchesCriteria(msg(), {})).toBe(true));
  it('describeCriteria formats dates and regexes', () => {
    expect(describeCriteria({ subject: /a/i, since: new Date('2026-01-01T00:00:00Z') })).toBe('subject=/a/i, since=2026-01-01T00:00:00.000Z');
  });
});

describe('extractCode', () => {
  const c = (text: string, html?: string) => msg({ text, html });
  it('finds 4-8 digit codes by default, not longer/shorter digit runs', () => {
    expect(extractCode(c('Your code: 4821'))).toBe('4821');
    expect(extractCode(c('Code 12345678 expires'))).toBe('12345678');
    expect(extractCode(c('Order 123456789 and 12'))).toBeNull();
    expect(extractCode(c('no digits here'))).toBeNull();
  });
  it('exact length', () => {
    expect(extractCode(c('ref 1234, code 987654'), { length: 6 })).toBe('987654');
    expect(extractCode(c('code 1234567'), { length: 6 })).toBeNull();
  });
  it('custom pattern: group 1 when present, else whole match', () => {
    expect(extractCode(c('Token: AB-9X'), { pattern: /Token: ([A-Z0-9-]+)/ })).toBe('AB-9X');
    expect(extractCode(c('Token: AB-9X'), { pattern: /[A-Z]{2}-\d[A-Z]/ })).toBe('AB-9X');
  });
  it('falls back to HTML text when the text part is blank', () => {
    expect(extractCode(c('  ', '<div>Your code is <b>654321</b></div><style>.a{width:1234px}</style>'))).toBe('654321');
  });
  it('MailClient delegates', async () => {
    const mail = await create();
    expect(mail.extractCode(c('code 1111'))).toBe('1111');
  });
});

describe('extractLinks', () => {
  const m = msg({
    text: 'Visit https://a.test/x?y=1&z=2. Also (https://b.test/path), https://a.test/x?y=1&z=2 again; http://c.test/;',
    html: '<a href="https://a.test/verify?t=1&amp;u=2">verify</a> <a href=\'https://d.test/unsub\'>u</a> <a href="mailto:a@b">m</a> <a href="/relative">r</a>',
  });
  it('finds hrefs first (entities decoded), then bare urls, de-duplicated, trailing punctuation trimmed', () => {
    expect(extractLinks(m)).toEqual(['https://a.test/verify?t=1&u=2', 'https://d.test/unsub', 'https://a.test/x?y=1&z=2', 'https://b.test/path', 'http://c.test/']);
  });
  it('ignores mailto and relative links', () => {
    expect(extractLinks(m).some((l) => l.includes('mailto') || l === '/relative')).toBe(false);
  });
  it('filter by string, regex and predicate', () => {
    expect(extractLinks(m, 'verify')).toEqual(['https://a.test/verify?t=1&u=2']);
    expect(extractLinks(m, /^https:\/\/b\./)).toEqual(['https://b.test/path']);
    expect(extractLinks(m, (u) => u.startsWith('http://'))).toEqual(['http://c.test/']);
    expect(extractLinks(m, 'nomatch')).toEqual([]);
  });
  it('mail with no links -> []', () => expect(extractLinks(msg({ text: 'nothing' }))).toEqual([]));
  it('MailClient delegates', async () => {
    const mail = await create();
    expect(mail.extractLinks(m, 'd.test')).toEqual(['https://d.test/unsub']);
  });
  it('htmlToText strips tags/styles/scripts and decodes entities', () => {
    const t = htmlToText('<style>p{}</style><p>a &amp; b</p><script>x()</script><div>1&lt;2</div>');
    expect(t).toContain('a & b');
    expect(t).toContain('1<2');
    expect(t).not.toContain('x()');
    expect(t).not.toContain('p{}');
  });
});

describe('MailClient.create configuration', () => {
  it('mailpit without url -> TF_MAIL_NOT_CONFIGURED', async () => {
    await expect(create({ provider: 'mailpit' })).rejects.toMatchObject({ code: 'TF_MAIL_NOT_CONFIGURED' });
  });
  it('mailtrap lists every missing field', async () => {
    const err = await create({ provider: 'mailtrap', apiKey: 'k' }).catch((e) => e);
    expect(err.code).toBe('TF_MAIL_NOT_CONFIGURED');
    expect(err.message).toContain('mail.accountId, mail.inboxId');
    expect(err.message).not.toContain('mail.apiKey');
  });
  it('imap without imap config -> TF_MAIL_NOT_CONFIGURED', async () => {
    await expect(create({ provider: 'imap' })).rejects.toMatchObject({ code: 'TF_MAIL_NOT_CONFIGURED' });
  });
});
