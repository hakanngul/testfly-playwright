import { DbClient } from '../clients/db';
import { RedisClient } from '../clients/db';
import { MailClient } from '../clients/mail';
import { TestFlyError } from '../core/errors';
import { coreTest } from './core';

/** Worker-scoped fixtures of {@link dataTest}. @public */
export interface DataWorkerFixtures {
  /** SQL database client (requires `testfly.db`). */
  db: DbClient;
  /** Redis client (requires `testfly.redis`). */
  redis: RedisClient;
  /** Mailbox client (requires `testfly.mail`). */
  mail: MailClient;
}

/**
 * Data-service fixture set (`db`, `redis`, `mail`). Connections are created lazily, once per worker,
 * the first time a test requests the fixture, and closed when the worker shuts down.
 *
 * @public
 */
export const dataTest = coreTest.extend<{}, DataWorkerFixtures>({
  db: [
    async ({ testfly }, use) => {
      if (!testfly.db) {
        throw new TestFlyError('TF_DB_NOT_CONFIGURED', 'The `db` fixture was used but testfly.db is not configured.', {
          hint: "Add testfly: { db: { client: 'postgres', connectionString: '${DATABASE_URL}' } } to playwright.config.ts.",
        });
      }
      const client = await DbClient.create(testfly.db);
      try {
        await use(client);
      } finally {
        await client.close();
      }
    },
    { scope: 'worker' },
  ],

  redis: [
    async ({ testfly }, use) => {
      if (!testfly.redis) {
        throw new TestFlyError('TF_DB_NOT_CONFIGURED', 'The `redis` fixture was used but testfly.redis is not configured.', {
          hint: "Add testfly: { redis: { url: '${REDIS_URL}' } } to playwright.config.ts.",
        });
      }
      const client = await RedisClient.create({ url: testfly.redis.url });
      try {
        await use(client);
      } finally {
        await client.close();
      }
    },
    { scope: 'worker' },
  ],

  mail: [
    async ({ testfly }, use) => {
      if (!testfly.mail) {
        throw new TestFlyError('TF_MAIL_NOT_CONFIGURED', 'The `mail` fixture was used but testfly.mail is not configured.', {
          hint: "Add testfly: { mail: { provider: 'mailpit', url: 'http://localhost:8025' } } to playwright.config.ts.",
        });
      }
      const client = await MailClient.create(testfly.mail, { poll: testfly.timeouts.poll, pollInterval: testfly.timeouts.pollInterval });
      try {
        await use(client);
      } finally {
        await client.close();
      }
    },
    { scope: 'worker' },
  ],
});
