#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

// Try loading built dist CLI, or ts-node/tsx in development if not built
const distCli = path.join(__dirname, '..', 'dist', 'cli', 'bin.js');
const distCliMjs = path.join(__dirname, '..', 'dist', 'cli', 'bin.mjs');

if (fs.existsSync(distCli)) {
  require(distCli);
} else if (fs.existsSync(distCliMjs)) {
  import(distCliMjs);
} else {
  // If running directly in source mode without build
  try {
    require('tsx/cli');
    process.argv.splice(1, 1, path.join(__dirname, '..', 'src', 'cli', 'bin.ts'));
  } catch {
    console.error('TestFly CLI: dist/cli/bin.js not found. Please build the package first with `npm run build`.');
    process.exit(1);
  }
}
