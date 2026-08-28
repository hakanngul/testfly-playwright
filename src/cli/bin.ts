#!/usr/bin/env node
import { createCli } from './index';

const cli = createCli();
cli.parseAsync(process.argv).catch((err) => {
  console.error('[TestFly CLI Error]:', err);
  process.exit(1);
});
