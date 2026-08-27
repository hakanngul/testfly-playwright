import fs from 'fs';
import path from 'path';

export interface InitOptions {
  cwd?: string;
  force?: boolean;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const targetDir = options.cwd || process.cwd();
  console.log(`\n🚀 Initializing TestFly Playwright project in: ${targetDir}\n`);

  // 1. Create directories
  const dirsToCreate = ['features', 'steps', 'tests'];
  for (const dir of dirsToCreate) {
    const fullPath = path.join(targetDir, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`  📁 Created directory: ${dir}/`);
    }
  }

  // 1.5. Create .gitignore if not exists
  const gitignorePath = path.join(targetDir, '.gitignore');
  if (!fs.existsSync(gitignorePath) || options.force) {
    const gitignoreContent = `node_modules/
dist/
reports/
.features-gen/
allure-results/
allure-report/
playwright-report/
cucumber-report/
test-results/
.playwright/
.env
.env.local
.DS_Store
*.log
`;
    fs.writeFileSync(gitignorePath, gitignoreContent, 'utf8');
    console.log(`  📄 Created: .gitignore`);
  }

  // 2. Create testfly.config.ts
  const testflyConfigPath = path.join(targetDir, 'testfly.config.ts');
  if (!fs.existsSync(testflyConfigPath) || options.force) {
    const testflyConfigContent = `import { defineTestFlyConfig } from '@testfly/playwright';

export default defineTestFlyConfig({
  baseUrl: 'https://demo.playwright.dev/todomvc',
  apiBaseUrl: 'https://jsonplaceholder.typicode.com',
  env: 'local',
  timeouts: {
    action: 10000,
    navigation: 30000,
  },
  reporting: {
    timeline: true,
    stepScreenshots: 'only-on-failure',
  },
});
`;
    fs.writeFileSync(testflyConfigPath, testflyConfigContent, 'utf8');
    console.log(`  📄 Created: testfly.config.ts`);
  }

  // 3. Create playwright.config.ts
  const playwrightConfigPath = path.join(targetDir, 'playwright.config.ts');
  if (!fs.existsSync(playwrightConfigPath) || options.force) {
    const playwrightConfigContent = `import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from '@testfly/playwright';

const testDir = defineBddConfig({
  features: 'features/*.feature',
  steps: ['steps/*.steps.ts', 'steps/**/*.steps.ts'],
  importTestFrom: require.resolve('@testfly/playwright'),
  disableWarnings: { importTestFrom: true },
});

export default defineConfig({
  testDir,
  outputDir: 'reports/test-results',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'reports/playwright', open: 'never' }],
    ['list'],
    ['allure-playwright', { resultsDir: 'reports/allure-results', detail: true, suiteTitle: true }],
    cucumberReporter('html', { outputFile: 'reports/cucumber/index.html' }),
    cucumberReporter('json', { outputFile: 'reports/cucumber/report.json' }),
  ],
  use: {
    baseURL: 'https://demo.playwright.dev/todomvc',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'bdd-tests',
      testDir,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'spec-tests',
      testDir: './tests',
      testMatch: /.*\\.spec\\.ts/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
});
`;
    fs.writeFileSync(playwrightConfigPath, playwrightConfigContent, 'utf8');
    console.log(`  📄 Created: playwright.config.ts`);
  }

  // 4. Create features/demo.feature
  const demoFeaturePath = path.join(targetDir, 'features', 'demo.feature');
  if (!fs.existsSync(demoFeaturePath) || options.force) {
    const demoFeatureContent = `Feature: TestFly Playwright Demo Akışı

  Scenario: Kullanıcı yapılacaklar listesine yeni görev ekler
    Given kullanıcı todo sayfasına gider
    When kullanıcı "TestFly ile test yaz" görevini ekler
    Then listede "TestFly ile test yaz" görevi görüntülenir
    And sistemde "TODO_CREATED" durumunda bir kayıt oluşur
`;
    fs.writeFileSync(demoFeaturePath, demoFeatureContent, 'utf8');
    console.log(`  📄 Created: features/demo.feature`);
  }

  // 5. Create steps/demo.steps.ts
  const demoStepsPath = path.join(targetDir, 'steps', 'demo.steps.ts');
  if (!fs.existsSync(demoStepsPath) || options.force) {
    const demoStepsContent = `import { Given, When, Then, expect } from '@testfly/playwright';

Given('kullanıcı todo sayfasına gider', async ({ page, step }) => {
  await step.info('TodoMVC demo sayfasına yönlendiriliyor');
  await page.goto('https://demo.playwright.dev/todomvc');
});

When('kullanıcı {string} görevini ekler', async ({ page, step }, taskName: string) => {
  await step.info(\`Yeni görev giriliyor: \${taskName}\`);
  const input = page.locator('.new-todo');
  await input.fill(taskName);
  await input.press('Enter');
});

Then('listede {string} görevi görüntülenir', async ({ page, step }, taskName: string) => {
  await step.info(\`Görevin görünürlüğü doğrulanıyor: \${taskName}\`);
  const item = page.locator('.todo-list li label');
  await expect(item).toHaveText(taskName);
});

Then('sistemde {string} durumunda bir kayıt oluşur', async ({ db, step }, status: string) => {
  await step.info(\`Veritabanında \${status} durumu kontrol ediliyor\`);
  await db.orders.assertStatus(status);
});
`;
    fs.writeFileSync(demoStepsPath, demoStepsContent, 'utf8');
    console.log(`  📄 Created: steps/demo.steps.ts`);
  }

  // 6. Create tests/demo.spec.ts
  const demoSpecPath = path.join(targetDir, 'tests', 'demo.spec.ts');
  if (!fs.existsSync(demoSpecPath) || options.force) {
    const demoSpecContent = `import { test, expect } from '@testfly/playwright';

test.describe('TestFly Standart Spec Testleri', () => {
  test('Doğrudan REST API ve DB Entegrasyon Akışı', async ({ api, db, step }) => {
    await step.info('REST API sorgusu başlatılıyor');
    const res = await api.get('https://jsonplaceholder.typicode.com/todos/1');
    expect(res.status).toBe(200);
    expect(res.data.id).toBe(1);

    await step.info('Veritabanı mock tablosuna kayıt ekleniyor');
    const user = await db.users.create({ name: 'TestFly User', role: 'admin' });
    expect(user.id).toBeDefined();
    expect(user.role).toBe('admin');
  });
});
`;
    fs.writeFileSync(demoSpecPath, demoSpecContent, 'utf8');
    console.log(`  📄 Created: tests/demo.spec.ts`);
  }

  // 7. Update package.json scripts & dependencies
  const pkgJsonPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      pkg.scripts = pkg.scripts || {};
      pkg.scripts['clean'] = 'testfly clean';
      pkg.scripts['test'] = 'testfly test';
      pkg.scripts['test:ui'] = 'testfly test --ui';
      pkg.scripts['test:report'] = 'testfly report';
      pkg.scripts['test:report:allure'] = 'testfly report --allure';
      pkg.scripts['test:report:cucumber'] = 'testfly report --cucumber';
      pkg.dependencies = pkg.dependencies || {};
      pkg.dependencies['@testfly/playwright'] = pkg.dependencies['@testfly/playwright'] || '*';
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
      console.log(`  📦 Updated package.json test scripts`);
    } catch (e) {
      console.warn(`  ⚠️ Could not update package.json:`, e);
    }
  }

  console.log(`\n✨ TestFly Playwright setup completed successfully!`);
  console.log(`\nRun your tests with:`);
  console.log(`  npx testfly test            # Runs both BDD (.feature) and standard (.spec.ts) tests`);
  console.log(`  npx testfly test --ui       # Opens Playwright interactive UI mode`);
  console.log(`  npx testfly clean           # Cleans all reports and temporary artifacts (like mvn clean)`);
  console.log(`  npx testfly report          # Opens Playwright HTML report`);
  console.log(`  npx testfly report --allure # Serves live Allure Dashboard\n`);
}
