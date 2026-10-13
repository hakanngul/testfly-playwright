#!/usr/bin/env node
import { createCli } from './index';

createCli()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
