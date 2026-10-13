import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import { resetSessions, startAppServer } from './server';

export default async function globalSetup(config: FullConfig): Promise<() => Promise<void>> {
  resetSessions(path.join(path.dirname(config.configFile ?? __dirname), '.testfly', 'sessions'));
  const server = await startAppServer();
  // Workers are forked after globalSetup, so they inherit this variable.
  process.env.E2E_SERVER = server.url;
  return () => server.close();
}
