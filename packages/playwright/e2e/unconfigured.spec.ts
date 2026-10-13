import { test } from './support/test';

// Each test must FAIL with the documented error code; vitest (test/fixtures/e2e.test.ts) checks the codes.
test.fail();

test('db without config', async ({ db }) => {
  void db;
});

test('redis without config', async ({ redis }) => {
  void redis;
});

test('mail without config', async ({ mail }) => {
  void mail;
});
