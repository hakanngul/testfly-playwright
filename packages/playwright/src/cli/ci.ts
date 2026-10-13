import fs from 'node:fs';
import path from 'node:path';
import { log, warn } from './util';

/** Options of `testfly ci`. @internal */
export interface CiOptions {
  provider?: string;
  cwd?: string;
  force?: boolean;
  /** Package manager used in the pipeline. Default: detected from the lockfile. */
  pm?: 'npm' | 'pnpm' | 'yarn';
  /** Number of shards. Default 1 (no sharding). */
  shards?: number;
}

type Pm = 'npm' | 'pnpm' | 'yarn';

function detectPm(cwd: string): Pm {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

const INSTALL: Record<Pm, string> = { npm: 'npm ci', pnpm: 'pnpm install --frozen-lockfile', yarn: 'yarn install --frozen-lockfile' };

function githubWorkflow(pm: Pm, shards: number): string {
  const setupPnpm = pm === 'pnpm' ? '      - uses: pnpm/action-setup@v4\n' : '';
  const matrix =
    shards > 1
      ? `    strategy:\n      fail-fast: false\n      matrix:\n        shard: [${Array.from({ length: shards }, (_, i) => i + 1).join(', ')}]\n`
      : '';
  const run =
    shards > 1
      ? `npx testfly shard --total ${shards} --index \${{ matrix.shard }} --history .testfly/history > shard.txt\n          npx testfly test -- $(cat shard.txt)`
      : 'npx testfly test';
  return `name: TestFly

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
${matrix}    steps:
      - uses: actions/checkout@v4
${setupPnpm}      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: ${pm}
      - run: ${INSTALL[pm]}
      - run: npx playwright install --with-deps chromium
      - name: Run tests
        run: |
          ${run}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: testfly-${shards > 1 ? 'shard-${{ matrix.shard }}' : 'results'}
          path: |
            .testfly/
            playwright-report/
            test-results/
          retention-days: 14
`;
}

function gitlabPipeline(pm: Pm): string {
  const pre = pm === 'pnpm' ? '    - corepack enable\n' : '';
  return `stages:
  - test

testfly:
  stage: test
  image: mcr.microsoft.com/playwright:v1.50.0-jammy
  script:
${pre}    - ${INSTALL[pm]}
    - npx testfly test
  artifacts:
    when: always
    paths:
      - .testfly/
      - playwright-report/
      - test-results/
    expire_in: 14 days
`;
}

/** Write a CI pipeline file (GitHub Actions or GitLab CI). Returns the exit code. @internal */
export async function runCi(options: CiOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const provider = (options.provider ?? 'github').toLowerCase();
  const pm = options.pm ?? detectPm(cwd);

  let rel: string;
  let content: string;
  if (provider === 'github') {
    rel = path.join('.github', 'workflows', 'testfly.yml');
    content = githubWorkflow(pm, Math.max(1, options.shards ?? 1));
  } else if (provider === 'gitlab') {
    rel = '.gitlab-ci.yml';
    content = gitlabPipeline(pm);
  } else {
    warn(`Unknown CI provider "${provider}". Supported: github, gitlab.`);
    return 2;
  }

  const full = path.join(cwd, rel);
  if (fs.existsSync(full) && !options.force) {
    warn(`${rel} already exists. Use --force to overwrite it.`);
    return 1;
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  log(`Created ${rel}`);
  return 0;
}
