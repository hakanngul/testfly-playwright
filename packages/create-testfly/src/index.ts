import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

type PackageManager = 'npm' | 'pnpm' | 'yarn';

interface Args {
  target?: string;
  bdd: boolean;
  pm?: PackageManager;
  help: boolean;
}

const HELP = `create-testfly - scaffold a TestFly Playwright project

Usage:
  npm create testfly@latest <directory> [options]

Options:
  --bdd                    include a BDD example (features + step definitions)
  --pm <npm|pnpm|yarn>     package manager used in the printed instructions (default: detected)
  -h, --help               show this help
`;

function parseArgs(argv: string[]): Args {
  const args: Args = { bdd: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-h' || arg === '--help') args.help = true;
    else if (arg === '--bdd') args.bdd = true;
    else if (arg === '--pm' || arg.startsWith('--pm=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      if (value !== 'npm' && value !== 'pnpm' && value !== 'yarn') fail(`--pm must be one of npm, pnpm, yarn (got "${value ?? ''}")`);
      args.pm = value as PackageManager;
    } else if (arg.startsWith('-')) fail(`Unknown option ${arg}\n\n${HELP}`);
    else if (!args.target) args.target = arg;
    else fail(`Unexpected argument "${arg}"\n\n${HELP}`);
  }
  return args;
}

function fail(message: string): never {
  console.error(`create-testfly: ${message}`);
  process.exit(1);
}

function detectPm(): PackageManager {
  const agent = process.env.npm_config_user_agent ?? '';
  if (agent.startsWith('pnpm')) return 'pnpm';
  if (agent.startsWith('yarn')) return 'yarn';
  return 'npm';
}

function copyDir(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    // npm strips ".gitignore" from published packages, so it ships as "_gitignore".
    const dest = path.join(to, entry.name === '_gitignore' ? '.gitignore' : entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

function toPackageName(dir: string): string {
  const name = path
    .basename(path.resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  return name || 'testfly-project';
}

function ownVersion(root: string): string {
  try {
    return (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version?: string }).version ?? 'latest';
  } catch {
    return 'latest';
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.target) fail(`Missing project directory.\n\n${HELP}`);

  const root = fileURLToPath(new URL('..', import.meta.url));
  const templates = path.join(root, 'templates');
  const targetDir = path.resolve(process.cwd(), args.target);

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    fail(`Directory "${args.target}" already exists and is not empty.`);
  }

  copyDir(path.join(templates, 'base'), targetDir);
  if (args.bdd) copyDir(path.join(templates, 'bdd'), targetDir);

  const version = ownVersion(root);
  const pkg = {
    name: toPackageName(targetDir),
    version: '0.0.0',
    private: true,
    scripts: {
      test: 'testfly test',
      'test:ui': 'testfly test --ui',
      report: 'testfly report',
      locators: 'testfly locators',
      doctor: 'testfly doctor',
    },
    devDependencies: {
      '@playwright/test': '^1.50.0',
      '@testfly/playwright': version === 'latest' ? 'latest' : `^${version}`,
      '@types/node': '^22.10.0',
      typescript: '~5.9.3',
    },
  };
  fs.writeFileSync(path.join(targetDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  const pm = args.pm ?? detectPm();
  const run = pm === 'npm' ? 'npx' : pm === 'pnpm' ? 'pnpm exec' : 'yarn';
  const relRaw = path.relative(process.cwd(), targetDir) || '.';
  const rel = relRaw.startsWith('..') ? args.target : relRaw;

  console.log(`\nCreated ${args.bdd ? 'a BDD ' : 'a '}TestFly project in ${targetDir}\n`);
  console.log('Next steps:');
  if (rel !== '.') console.log(`  cd ${rel}`);
  console.log(`  ${pm} install`);
  console.log(`  ${run} playwright install chromium`);
  console.log(`  ${run} testfly locators`);
  console.log(`  ${pm === 'npm' ? 'npm test' : `${pm} test`}\n`);
}

main();
