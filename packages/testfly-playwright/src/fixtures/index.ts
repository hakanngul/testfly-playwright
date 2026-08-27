import { test as base } from 'playwright-bdd';
import { ApiClient } from '../client/ApiClient';
import { DbClient } from '../db/DbClient';
import { MailClient } from '../mail/MailClient';
import { StepLogger } from '../steps/StepLogger';
import { AuthManager } from '../auth/AuthManager';

import { apiFixture } from './api.fixture';
import { dbFixture } from './db.fixture';
import { mailFixture } from './mail.fixture';
import { stepFixture } from './step.fixture';
import { authFixture } from './auth.fixture';

export interface TestFlyFixtures {
  api: ApiClient;
  db: DbClient;
  mail: MailClient;
  step: StepLogger;
  auth: AuthManager;
}

export const test = base.extend<TestFlyFixtures>({
  api: apiFixture,
  db: dbFixture,
  mail: mailFixture,
  step: stepFixture,
  auth: authFixture,
});

export { expect } from '@playwright/test';
export * from './api.fixture';
export * from './db.fixture';
export * from './mail.fixture';
export * from './step.fixture';
export * from './auth.fixture';
