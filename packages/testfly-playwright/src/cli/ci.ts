import fs from 'fs';
import path from 'path';

export interface CiOptions {
  provider?: 'github' | 'gitlab';
  cwd?: string;
  force?: boolean;
}

export async function runCi(options: CiOptions = {}): Promise<void> {
  const targetDir = options.cwd || process.cwd();
  const provider = options.provider || 'github';

  console.log(`\n🚀 Generating CI/CD pipeline template for: ${provider.toUpperCase()} in ${targetDir}\n`);

  if (provider === 'github') {
    const workflowsDir = path.join(targetDir, '.github', 'workflows');
    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true });
    }

    const workflowPath = path.join(workflowsDir, 'testfly.yml');
    if (fs.existsSync(workflowPath) && !options.force) {
      console.warn(`  ⚠️ .github/workflows/testfly.yml zaten mevcut. Üzerine yazmak için --force kullanın.`);
      return;
    }

    const workflowContent = `name: TestFly Automation Suite

on:
  push:
    branches: [ main, master, develop ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:
    inputs:
      tags:
        description: 'Filter tests by tag (e.g. @smoke, @api, @ui)'
        required: false
        default: ''

jobs:
  test:
    name: Run TestFly Playwright Tests
    timeout-minutes: 30
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Browsers with dependencies
        run: npx playwright install --with-deps chromium

      - name: Run TestFly Tests
        run: |
          if [ -n "\${{ github.event.inputs.tags }}" ]; then
            npx testfly test --grep "\${{ github.event.inputs.tags }}"
          else
            npx testfly test
          fi

      - name: Generate Allure Static Report
        if: always()
        run: npx testfly report --allure --generate

      - name: Upload Test Reports Artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: testfly-reports
          path: reports/
          retention-days: 14

      - name: Upload Playwright Trace & Artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: testfly-traces
          path: reports/test-results/
          retention-days: 7
`;

    fs.writeFileSync(workflowPath, workflowContent, 'utf8');
    console.log(`  📄 Created GitHub Actions pipeline: .github/workflows/testfly.yml`);
    console.log(`\n✨ GitHub Actions entegrasyonu hazır!`);
    return;
  }

  if (provider === 'gitlab') {
    const gitlabPath = path.join(targetDir, '.gitlab-ci.yml');
    if (fs.existsSync(gitlabPath) && !options.force) {
      console.warn(`  ⚠️ .gitlab-ci.yml zaten mevcut. Üzerine yazmak için --force kullanın.`);
      return;
    }

    const gitlabContent = `stages:
  - test

testfly_tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.50.0-jammy
  script:
    - npm ci
    - npx testfly test
    - npx testfly report --allure --generate
  artifacts:
    when: always
    paths:
      - reports/
    expire_in: 14 days
`;

    fs.writeFileSync(gitlabPath, gitlabContent, 'utf8');
    console.log(`  📄 Created GitLab CI pipeline: .gitlab-ci.yml`);
    console.log(`\n✨ GitLab CI entegrasyonu hazır!`);
  }
}
