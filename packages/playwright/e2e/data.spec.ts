import { expect, test } from './support/test';

test.describe('db fixture with the explicit mock client', () => {
  test('in-memory tables', async ({ db }) => {
    const users = db.mock!.table<{ id?: number; name: string }>('users');
    const created = await users.create({ name: 'Ada' });
    expect(created.id).toBe(1);
    expect(await users.findOne({ name: 'Ada' })).toMatchObject({ name: 'Ada' });
    expect(await users.count()).toBe(1);
    await users.clear();
  });

  test('mock has no SQL engine and says so (no fake results)', async ({ db }) => {
    await expect(db.query('select 1')).rejects.toMatchObject({ code: 'TF_DB_QUERY_FAILED' });
  });
});

test.describe('mail fixture with the explicit mock provider', () => {
  test('delivers, waits, extracts code and links', async ({ mail }) => {
    await mail.clear();
    mail.mock!.deliver({ from: 'noreply@app.io', to: 'ada@example.com', subject: 'Verify your email', text: 'Your code is 482913. Open https://app.io/verify?t=abc to continue.' });
    const msg = await mail.waitForEmail({ to: 'ada@example.com', subject: /verify/i });
    expect(mail.extractCode(msg)).toBe('482913');
    expect(mail.extractLinks(msg)).toEqual(['https://app.io/verify?t=abc']);
    expect((await mail.latest('ada@example.com'))?.id).toBe(msg.id);
  });

  test('waitForEmail throws TF_MAIL_TIMEOUT when nothing matches (never fabricates a mail)', async ({ mail }) => {
    await mail.clear();
    const started = Date.now();
    const error = await mail.waitForEmail({ to: 'nobody@example.com', timeout: 300, pollInterval: 50 }).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'TestFlyError', code: 'TF_MAIL_TIMEOUT' });
    expect((error as Error).message).toContain('nobody@example.com');
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
  });

  test('waitForEmail finds a mail delivered while polling', async ({ mail }) => {
    await mail.clear();
    setTimeout(() => mail.mock!.deliver({ from: 'a@b.c', to: 'late@example.com', subject: 'late', text: 'hi' }), 150);
    const msg = await mail.waitForEmail({ to: 'late@example.com', timeout: 3000, pollInterval: 30 });
    expect(msg.subject).toBe('late');
  });
});

test('redis stays unconfigured when only db and mail are set', async ({ testfly }) => {
  expect(testfly.redis).toBeUndefined();
  expect(testfly.db).toEqual({ client: 'mock', pool: { max: 5 } });
});
