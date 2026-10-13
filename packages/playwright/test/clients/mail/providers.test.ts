import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailClient } from '../../../src/clients/mail';
import { parseMime } from '../../../src/clients/mail/providers/mime';
import { MailOptionsSchema } from '../../../src/core/config/schema';
import { json, startServer, type TestServer } from '../../helpers/clientsHttp';

const modules: Record<string, unknown> = {};
vi.mock('../../../src/core/errors', async (orig) => {
  const actual = await orig<typeof import('../../../src/core/errors')>();
  return {
    ...actual,
    importOptional: vi.fn(async (name: string, feature: string) => {
      if (!(name in modules)) throw new actual.TestFlyError('TF_OPTIONAL_DEPENDENCY_MISSING', `${feature} requires the optional package "${name}".`);
      return modules[name];
    }),
  };
});

const timeouts = { poll: 300, pollInterval: 10 };
const opts = (o: Record<string, unknown>) => MailOptionsSchema.parse(o);

describe('mailpit provider (local http server)', () => {
  let server: TestServer;
  let messages: Array<{ ID: string; From: unknown; To: unknown; Subject: string; Date: string; Text?: string; HTML?: string }>;
  let listStatus = 200;

  beforeEach(async () => {
    listStatus = 200;
    messages = [
      { ID: 'm1', From: { Name: 'Shop', Address: 'noreply@shop.test' }, To: [{ Address: 'alice@example.com' }], Subject: 'Welcome', Date: '2026-03-01T10:00:00Z', Text: 'Your code is 424242', HTML: '' },
      { ID: 'm2', From: null, To: null, Subject: 'Weird', Date: '2026-03-02T10:00:00Z', HTML: '<a href="https://l.test/a">go</a>' },
    ];
    server = await startServer((req, res) => {
      if (req.path === '/api/v1/messages' && req.method === 'GET') {
        if (listStatus !== 200) {
          res.writeHead(listStatus);
          return res.end('err');
        }
        return json(res, 200, { total: messages.length, messages: messages.map((m) => ({ ID: m.ID })) });
      }
      if (req.path === '/api/v1/messages' && req.method === 'DELETE') {
        messages = [];
        return json(res, 200, 'ok');
      }
      const m = /^\/api\/v1\/message\/(.+)$/.exec(req.path);
      if (m) {
        const found = messages.find((x) => x.ID === decodeURIComponent(m[1]));
        return found ? json(res, 200, found) : json(res, 404, {});
      }
      json(res, 404, {});
    });
  });
  afterEach(() => server.close());

  const mk = (url = server.url) => MailClient.create(opts({ provider: 'mailpit', url }), timeouts);

  it('lists messages mapping mailpit fields (null-safe)', async () => {
    const mail = await mk();
    const all = await mail.list();
    expect(all.map((m) => m.id)).toEqual(['m2', 'm1']);
    const m1 = all.find((m) => m.id === 'm1')!;
    expect(m1).toMatchObject({ from: 'noreply@shop.test', to: ['alice@example.com'], subject: 'Welcome', text: 'Your code is 424242' });
    expect(m1.html).toBeUndefined();
    expect(m1.date).toEqual(new Date('2026-03-01T10:00:00Z'));
    const m2 = all.find((m) => m.id === 'm2')!;
    expect(m2).toMatchObject({ from: '', to: [], text: '' });
    expect(m2.html).toContain('l.test');
  });

  it('waitForEmail + extractCode / extractLinks end-to-end', async () => {
    const mail = await mk();
    const hit = await mail.waitForEmail({ to: 'alice@example.com', subject: /welcome/i });
    expect(mail.extractCode(hit)).toBe('424242');
    const hit2 = await mail.waitForEmail({ contains: 'l.test' });
    expect(mail.extractLinks(hit2)).toEqual(['https://l.test/a']);
  });

  it('fetches each message detail only once (cache) but re-lists every poll', async () => {
    const mail = await mk();
    await mail.list();
    await mail.list();
    await mail.list();
    expect(server.requests.filter((r) => r.path === '/api/v1/messages')).toHaveLength(3);
    expect(server.requests.filter((r) => r.path.startsWith('/api/v1/message/'))).toHaveLength(2);
  });

  it('sees mails that arrive later while waiting', async () => {
    const mail = await mk();
    await mail.list();
    setTimeout(() => messages.push({ ID: 'm3', From: { Address: 'x@y' }, To: [{ Address: 'late@x' }], Subject: 'Later', Date: new Date().toISOString(), Text: 't' }), 40);
    expect((await mail.waitForEmail({ to: 'late@x', timeout: 2000 })).id).toBe('m3');
  });

  it('clear deletes on the server and resets the cache', async () => {
    const mail = await mk();
    await mail.list();
    await mail.clear();
    expect(server.requests.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/v1/messages' });
    expect(await mail.list()).toEqual([]);
  });

  it('timeout error names the provider and mailbox size (no mock hint)', async () => {
    const mail = await mk();
    const err = await mail.waitForEmail({ to: 'nobody@x', timeout: 50, pollInterval: 10 }).catch((e) => e);
    expect(err.code).toBe('TF_MAIL_TIMEOUT');
    expect(err.message).toContain('2 email(s) seen in the mailpit mailbox');
    expect(err.hint).not.toMatch(/mock/);
  });

  it('http errors -> TF_MAIL_PROVIDER_ERROR (never swallowed into a timeout)', async () => {
    const mail = await mk();
    listStatus = 500;
    const err = await mail.waitForEmail({ timeout: 2000 }).catch((e) => e);
    expect(err.code).toBe('TF_MAIL_PROVIDER_ERROR');
    expect(err.message).toContain('500');
    expect(err.details.status).toBe(500);
  });

  it('a message listed but missing on detail (404) is a provider error', async () => {
    const mail = await mk();
    messages.push({ ID: 'gone', From: null, To: null, Subject: '', Date: '2026-01-01' });
    server.handle((req, res) => (req.path === '/api/v1/messages' ? json(res, 200, { messages: [{ ID: 'ghost' }] }) : json(res, 404, {})));
    await expect(mail.list()).rejects.toMatchObject({ code: 'TF_MAIL_PROVIDER_ERROR' });
  });

  it('unreachable server -> TF_MAIL_PROVIDER_ERROR with cause', async () => {
    const dead = await startServer(() => undefined);
    const url = dead.url;
    await dead.close();
    const err = await (await mk(url)).list().catch((e) => e);
    expect(err.code).toBe('TF_MAIL_PROVIDER_ERROR');
    expect(err.cause).toBeDefined();
  });

  it('accepts the MailHog v2 style "Messages" key and trailing slashes in the url', async () => {
    server.handle((req, res) => {
      if (req.path === '/api/v1/messages') return json(res, 200, { Messages: [{ ID: 'h1' }] });
      json(res, 200, { ID: 'h1', From: { Address: 'a@b' }, To: [{ Address: 'c@d' }], Subject: 'hog', Date: '2026-01-01T00:00:00Z', Text: 't' });
    });
    const mail = await mk(`${server.url}///`);
    expect((await mail.list())[0].subject).toBe('hog');
  });
});

describe('mailtrap provider (local http server)', () => {
  let server: TestServer;
  let items: Array<{ id: number; subject: string; from_email: string; to_email: string; created_at: string }>;
  let bodies: Record<string, { txt?: string; html?: string }>;
  let failBody: string | undefined;

  beforeEach(async () => {
    failBody = undefined;
    items = [
      { id: 11, subject: 'Hi', from_email: 'a@shop.test', to_email: 'bob@example.com', created_at: '2026-03-01T10:00:00Z' },
      { id: 12, subject: 'HtmlOnly', from_email: 'a@shop.test', to_email: 'bob@example.com', created_at: '2026-03-02T10:00:00Z' },
    ];
    bodies = { 11: { txt: 'Code 999111', html: '<p>Code 999111</p>' }, 12: { html: '<a href="https://h.test/1">x</a>' } };
    server = await startServer((req, res) => {
      const base = '/api/accounts/acc1/inboxes/inb1';
      if (req.headers['api-token'] !== 'tok') return json(res, 401, { error: 'unauthorized' });
      if (req.path === `${base}/messages` && req.method === 'GET') return json(res, 200, items);
      if (req.path === `${base}/clean` && req.method === 'PATCH') {
        items = [];
        return json(res, 200, {});
      }
      const m = new RegExp(`^${base}/messages/(\\d+)/body\\.(txt|html)$`).exec(req.path);
      if (m) {
        if (failBody === m[2]) return json(res, 500, {});
        const b = bodies[m[1]]?.[m[2] as 'txt' | 'html'];
        if (b === undefined) return json(res, 404, {});
        res.writeHead(200, { 'content-type': 'text/plain' });
        return res.end(b);
      }
      json(res, 404, {});
    });
  });
  afterEach(() => server.close());

  const mk = (extra: Record<string, unknown> = {}) =>
    MailClient.create(opts({ provider: 'mailtrap', url: server.url, apiKey: 'tok', accountId: 'acc1', inboxId: 'inb1', ...extra }), timeouts);

  it('lists messages, authenticating with Api-Token, and tolerates a 404 on a missing txt part', async () => {
    const mail = await mk();
    const all = await mail.list();
    expect(all.map((m) => m.id)).toEqual(['12', '11']);
    const m11 = all.find((m) => m.id === '11')!;
    expect(m11).toMatchObject({ from: 'a@shop.test', to: ['bob@example.com'], subject: 'Hi', text: 'Code 999111', html: '<p>Code 999111</p>' });
    const m12 = all.find((m) => m.id === '12')!;
    expect(m12.text).toBe('');
    expect(m12.html).toContain('h.test');
    expect(server.requests.every((r) => r.headers['api-token'] === 'tok')).toBe(true);
  });

  it('waitForEmail + extraction; bodies are cached after the first fetch', async () => {
    const mail = await mk();
    const hit = await mail.waitForEmail({ subject: 'Hi' });
    expect(mail.extractCode(hit)).toBe('999111');
    await mail.list();
    expect(server.requests.filter((r) => /body\./.test(r.path))).toHaveLength(4);
    expect((await mail.waitForEmail({ subject: 'HtmlOnly' })).id).toBe('12');
    expect(mail.extractLinks(await mail.waitForEmail({ subject: 'HtmlOnly' }))).toEqual(['https://h.test/1']);
  });

  it('non-404 body failures are provider errors (not hidden as empty bodies)', async () => {
    failBody = 'html';
    const mail = await mk();
    await expect(mail.list()).rejects.toMatchObject({ code: 'TF_MAIL_PROVIDER_ERROR' });
  });

  it('wrong api key -> TF_MAIL_PROVIDER_ERROR 401', async () => {
    const mail = await mk({ apiKey: 'wrong' });
    const err = await mail.list().catch((e) => e);
    expect(err.code).toBe('TF_MAIL_PROVIDER_ERROR');
    expect(err.details.status).toBe(401);
  });

  it('clear uses PATCH /clean', async () => {
    const mail = await mk();
    await mail.list();
    await mail.clear();
    expect(server.requests.at(-1)).toMatchObject({ method: 'PATCH' });
    expect(server.requests.at(-1)!.path).toMatch(/\/inboxes\/inb1\/clean$/);
    expect(await mail.list()).toEqual([]);
  });

  it('timeout reports the mailtrap mailbox', async () => {
    const mail = await mk();
    const err = await mail.waitForEmail({ to: 'nobody@x', timeout: 40, pollInterval: 10 }).catch((e) => e);
    expect(err.code).toBe('TF_MAIL_TIMEOUT');
    expect(err.message).toContain('2 email(s) seen in the mailtrap mailbox');
  });
});

describe('imap provider (fake imapflow)', () => {
  interface Fake {
    ctorArgs?: any;
    exists: number;
    fetchRange?: string;
    released: number;
    deleted?: string;
    loggedOut: boolean;
    messages: any[];
    connectError?: Error;
    fetchError?: Error;
    lockedMailbox?: string;
  }
  let fake: Fake;

  beforeEach(() => {
    for (const k of Object.keys(modules)) delete modules[k];
    fake = { exists: 0, released: 0, loggedOut: false, messages: [] };
    class ImapFlow {
      mailbox = { exists: 0 };
      constructor(args: unknown) {
        fake.ctorArgs = args;
      }
      on() {}
      async connect() {
        if (fake.connectError) throw fake.connectError;
      }
      async getMailboxLock(name: string) {
        fake.lockedMailbox = name;
        this.mailbox.exists = fake.exists;
        return { release: () => void fake.released++ };
      }
      async *fetch(range: string) {
        fake.fetchRange = range;
        if (fake.fetchError) throw fake.fetchError;
        for (const m of fake.messages) yield m;
      }
      async messageDelete(range: string) {
        fake.deleted = range;
      }
      async logout() {
        fake.loggedOut = true;
      }
    }
    modules.imapflow = { ImapFlow };
  });

  const imap = { host: 'imap.test', user: 'u', pass: 'p' };
  const mk = (extra: Record<string, unknown> = {}) => MailClient.create(opts({ provider: 'imap', imap: { ...imap, ...extra } }), timeouts);

  const raw = (parts: string[]) => Buffer.from(parts.join('\r\n'), 'latin1');

  it('missing imapflow -> TF_OPTIONAL_DEPENDENCY_MISSING', async () => {
    delete modules.imapflow;
    await expect(mk()).rejects.toMatchObject({ code: 'TF_OPTIONAL_DEPENDENCY_MISSING' });
  });

  it('connects with credentials and schema defaults', async () => {
    await mk();
    expect(fake.ctorArgs).toMatchObject({ host: 'imap.test', port: 993, secure: true, auth: { user: 'u', pass: 'p' } });
  });

  it('connect failure -> TF_MAIL_PROVIDER_ERROR', async () => {
    fake.connectError = new Error('ECONNREFUSED');
    const err = await mk().catch((e) => e);
    expect(err.code).toBe('TF_MAIL_PROVIDER_ERROR');
    expect(err.message).toContain('imap.test');
  });

  it('empty mailbox -> [] and the lock is released', async () => {
    const mail = await mk();
    expect(await mail.list()).toEqual([]);
    expect(fake.released).toBe(1);
    expect(fake.lockedMailbox).toBe('INBOX');
  });

  it('maps envelope + MIME (multipart/alternative, quoted-printable) and fetches only the newest 50', async () => {
    fake.exists = 120;
    fake.messages = [
      {
        uid: 77,
        envelope: { from: [{ address: 'sender@x.test' }], to: [{ address: 'rcpt@x.test' }], cc: [{ address: 'cc@x.test' }, {}], subject: 'Hello', date: new Date('2026-03-04T00:00:00Z') },
        internalDate: new Date('2026-01-01'),
        source: raw([
          'Subject: Hello',
          'Content-Type: multipart/alternative; boundary="BND"',
          '',
          '--BND',
          'Content-Type: text/plain; charset=utf-8',
          'Content-Transfer-Encoding: quoted-printable',
          '',
          'Code=3A 135790 =\r\nend',
          '--BND',
          'Content-Type: text/html; charset=utf-8',
          '',
          '<p>Code: <b>135790</b></p>',
          '--BND--',
          '',
        ]),
      },
    ];
    const mail = await mk({ mailbox: 'Custom' });
    const [m] = await mail.list();
    expect(fake.lockedMailbox).toBe('Custom');
    expect(fake.fetchRange).toBe('71:*');
    expect(m).toMatchObject({ id: '77', from: 'sender@x.test', to: ['rcpt@x.test', 'cc@x.test'], subject: 'Hello' });
    expect(m.text.trim()).toBe('Code: 135790 end');
    expect(m.html!.trim()).toBe('<p>Code: <b>135790</b></p>');
    expect(m.date).toEqual(new Date('2026-03-04T00:00:00Z'));
    expect(mail.extractCode(m)).toBe('135790');
    expect(fake.released).toBe(1);
  });

  it('falls back to internalDate and handles envelope-less messages', async () => {
    fake.exists = 3;
    fake.messages = [{ uid: 1, internalDate: new Date('2026-02-02T00:00:00Z'), source: raw(['Content-Type: text/plain', '', 'plain body']) }];
    const [m] = await (await mk()).list();
    expect(fake.fetchRange).toBe('1:*');
    expect(m).toMatchObject({ id: '1', from: '', to: [], subject: '', text: 'plain body' });
    expect(m.date).toEqual(new Date('2026-02-02T00:00:00Z'));
  });

  it('waitForEmail works against imap and times out honestly', async () => {
    fake.exists = 1;
    fake.messages = [{ uid: 5, envelope: { from: [{ address: 'a@b' }], to: [{ address: 'me@x' }], subject: 'Verify', date: new Date() }, source: raw(['', 'code 5555']) }];
    const mail = await mk();
    expect((await mail.waitForEmail({ to: 'me@x', subject: 'verify' })).id).toBe('5');
    const err = await mail.waitForEmail({ to: 'none@x', timeout: 40, pollInterval: 10 }).catch((e) => e);
    expect(err.code).toBe('TF_MAIL_TIMEOUT');
    expect(err.message).toContain('1 email(s) seen in the imap mailbox');
  });

  it('fetch errors -> TF_MAIL_PROVIDER_ERROR and the lock is still released', async () => {
    fake.exists = 1;
    fake.fetchError = new Error('connection lost');
    const err = await (await mk()).list().catch((e) => e);
    expect(err.code).toBe('TF_MAIL_PROVIDER_ERROR');
    expect(err.message).toContain('connection lost');
    expect(fake.released).toBe(1);
  });

  it('clear deletes 1:* only when the mailbox is not empty', async () => {
    const mail = await mk();
    await mail.clear();
    expect(fake.deleted).toBeUndefined();
    fake.exists = 2;
    await mail.clear();
    expect(fake.deleted).toBe('1:*');
    expect(fake.released).toBe(2);
  });

  it('close logs out', async () => {
    const mail = await mk();
    await mail.close();
    expect(fake.loggedOut).toBe(true);
  });
});

describe('parseMime', () => {
  it('decodes base64 parts and charsets', () => {
    const r = parseMime(
      ['Content-Type: multipart/mixed; boundary=B1', '', '--B1', 'Content-Type: text/plain; charset=iso-8859-9', 'Content-Transfer-Encoding: base64', '', Buffer.from([0x4d, 0xfd, 0x72]).toString('base64'), '--B1--'].join('\r\n'),
    );
    expect(r.text).toBe('Mır');
  });
  it('handles nested multiparts and keeps the first html/text part', () => {
    const r = parseMime(
      [
        'Content-Type: multipart/mixed; boundary="OUT"',
        '',
        '--OUT',
        'Content-Type: multipart/alternative; boundary="IN"',
        '',
        '--IN',
        'Content-Type: text/plain',
        '',
        'first text',
        '--IN',
        'Content-Type: text/html',
        '',
        '<b>first html</b>',
        '--IN--',
        '--OUT',
        'Content-Type: text/plain',
        '',
        'attachment-ish text',
        '--OUT--',
      ].join('\n'),
    );
    expect(r.text.trim()).toBe('first text');
    expect(r.html!.trim()).toBe('<b>first html</b>');
  });
  it('defaults to text/plain without headers and ignores non-text parts', () => {
    expect(parseMime('Subject: x\r\n\r\nbody').text).toBe('body');
    const r = parseMime(['Content-Type: multipart/mixed; boundary=Z', '', '--Z', 'Content-Type: image/png', '', 'PNGDATA', '--Z--'].join('\r\n'));
    expect(r).toEqual({ text: '' });
  });
});
