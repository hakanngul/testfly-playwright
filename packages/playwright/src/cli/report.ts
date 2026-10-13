import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findPlaywrightConfig, log, playwrightCli, runNode, warn } from './util';

/** Options of `testfly report`. @internal */
export interface ReportOptions {
  cwd?: string;
  /** Output directory of the TestFly reporter. Default `.testfly`. */
  outputDir?: string;
}

function openFile(file: string): void {
  const [command, args]: [string, string[]] =
    process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => log(`Open this file in your browser: ${file}`));
    child.unref();
  } catch {
    log(`Open this file in your browser: ${file}`);
  }
}

/**
 * `testfly report [type]`: `testfly` (default) opens the dashboard written by @testfly/reporter,
 * `html` opens the Playwright HTML report.
 * @internal
 */
export async function runReport(type: string | undefined, options: ReportOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const kind = type ?? 'testfly';

  if (kind === 'html' || kind === 'playwright') {
    const dir = path.resolve(cwd, 'playwright-report');
    if (!fs.existsSync(dir)) {
      warn('playwright-report/ not found. Run `testfly test` first.');
      return 1;
    }
    return runNode(playwrightCli(cwd), ['show-report', dir], { cwd });
  }

  if (kind !== 'testfly') {
    warn(`Unknown report type "${kind}". Use "testfly" or "html".`);
    return 1;
  }

  const outputDir = options.outputDir ?? '.testfly';
  const file = path.resolve(cwd, outputDir, 'report', 'index.html');
  if (!fs.existsSync(file)) {
    warn(`${path.relative(cwd, file)} not found. Run \`testfly test\` with the TestFly reporter enabled first${findPlaywrightConfig(cwd) ? '' : ' (no playwright config found)'}.`);
    return 1;
  }
  log(`Opening ${path.relative(cwd, file)}`);
  openFile(file);
  return 0;
}
