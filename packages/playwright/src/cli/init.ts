import fs from 'node:fs';
import path from 'node:path';
import { GITIGNORE_ENTRIES, GITIGNORE_TEMPLATE, projectTemplates } from './templates';
import { log, warn } from './util';

/** Options of `testfly init`. @internal */
export interface InitOptions {
  cwd?: string;
  /** Overwrite existing files. */
  force?: boolean;
  /** Generate the BDD flavour (default true). */
  bdd?: boolean;
}

function write(root: string, rel: string, content: string, force: boolean): void {
  const full = path.join(root, rel);
  if (fs.existsSync(full) && !force) {
    log(`  skipped   ${rel} (exists, use --force to overwrite)`);
    return;
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  log(`  created   ${rel}`);
}

function updateGitignore(root: string): void {
  const file = path.join(root, '.gitignore');
  if (!fs.existsSync(file)) {
    write(root, '.gitignore', GITIGNORE_TEMPLATE, false);
    return;
  }
  const current = fs.readFileSync(file, 'utf8');
  const have = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const missing = GITIGNORE_ENTRIES.filter((entry) => !have.has(entry));
  if (missing.length === 0) return;
  const prefix = current.endsWith('\n') || current === '' ? '' : '\n';
  fs.appendFileSync(file, `${prefix}\n# TestFly\n${missing.join('\n')}\n`);
  log(`  updated   .gitignore (+${missing.length} entries)`);
}

function updatePackageJson(root: string): void {
  const file = path.join(root, 'package.json');
  if (!fs.existsSync(file)) return;
  try {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Record<string, string> | undefined>;
    pkg.scripts = { ...(pkg.scripts ?? {}) };
    pkg.scripts.test ??= 'testfly test';
    pkg.scripts['test:ui'] ??= 'testfly test --ui';
    pkg.scripts['test:report'] ??= 'testfly report';
    pkg.scripts.doctor ??= 'testfly doctor';
    fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    log('  updated   package.json (scripts)');
  } catch (error) {
    warn(`could not update package.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Scaffold a TestFly project into `cwd`. @internal */
export async function runInit(options: InitOptions = {}): Promise<void> {
  const root = path.resolve(options.cwd ?? process.cwd());
  const bdd = options.bdd ?? true;
  log(`\nInitializing TestFly in ${root}\n`);

  for (const [rel, content] of Object.entries(projectTemplates({ bdd }))) {
    write(root, rel, content, options.force ?? false);
  }
  updateGitignore(root);
  updatePackageJson(root);

  log('\nNext steps:');
  log('  npm i -D @testfly/playwright @playwright/test');
  log('  npx playwright install chromium');
  log('  npx testfly locators      # generate typed locator keys');
  log('  npx testfly test          # run the example tests');
  log('  npx testfly doctor        # check your setup\n');
}
