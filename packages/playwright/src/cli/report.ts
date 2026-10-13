import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface ReportOptions {
  allure?: boolean;
  cucumber?: boolean;
  generate?: boolean;
  port?: string;
  outputDir?: string;
}

function openBrowserUrl(targetPathOrUrl: string): void {
  const isUrl = targetPathOrUrl.startsWith('http://') || targetPathOrUrl.startsWith('https://');
  const fullTarget = isUrl ? targetPathOrUrl : path.resolve(process.cwd(), targetPathOrUrl);

  const startCmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';

  try {
    execSync(`${startCmd} "${fullTarget}"`, { stdio: 'ignore' });
  } catch {
    console.log(`\n  👉 Raporu tarayıcınızda açın: ${fullTarget}\n`);
  }
}

function findExistingPath(...candidates: string[]): string | null {
  for (const c of candidates) {
    const full = path.resolve(process.cwd(), c);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return null;
}

export async function runReport(type: string | undefined, options: ReportOptions = {}): Promise<void> {
  const isAllure = options.allure || type === 'allure';
  const isCucumber = options.cucumber || type === 'cucumber';

  // 1. Allure Report
  if (isAllure) {
    const resolvedDir = options.outputDir
      ? path.resolve(process.cwd(), options.outputDir)
      : findExistingPath('reports/allure-results', 'allure-results');

    if (!resolvedDir || !fs.existsSync(resolvedDir)) {
      console.warn(`\n⚠️  Allure sonuç dizini bulunamadı (reports/allure-results veya allure-results)`);
      console.warn(`Lütfen önce testlerinizi çalıştırın: npx testfly test\n`);
      return;
    }

    if (options.generate) {
      const targetReportDir = path.resolve(process.cwd(), 'reports/allure-report');
      console.log(`\n📊 Generating Allure static report to: ${targetReportDir}...`);
      execSync(`npx allure generate "${resolvedDir}" --clean -o "${targetReportDir}"`, { stdio: 'inherit' });
      console.log(`✨ Allure raporu başarıyla oluşturuldu: ${targetReportDir}`);
      openBrowserUrl(path.join(targetReportDir, 'index.html'));
      return;
    }

    console.log(`\n🚀 Starting Allure Report server from: ${resolvedDir}...`);
    const portArg = options.port ? ` -p ${options.port}` : '';
    const child = spawn(`npx allure serve "${resolvedDir}"${portArg}`, {
      shell: true,
      stdio: 'inherit',
    });

    child.on('error', (err) => {
      console.error('Allure server başlatılamadı:', err);
    });
    return;
  }

  // 2. Cucumber HTML Report
  if (isCucumber) {
    const resolvedPath = options.outputDir
      ? path.resolve(process.cwd(), options.outputDir)
      : findExistingPath('reports/cucumber/index.html', 'cucumber-report/index.html');

    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      console.warn(`\n⚠️  Cucumber HTML raporu bulunamadı (reports/cucumber/index.html veya cucumber-report/index.html)`);
      console.warn(`Lütfen önce testlerinizi çalıştırın: npx testfly test\n`);
      return;
    }

    console.log(`\n🥒 Opening Cucumber HTML Report: ${resolvedPath}...`);
    openBrowserUrl(resolvedPath);
    return;
  }

  // 3. Playwright Default HTML Report
  const resolvedPwDir = options.outputDir
    ? path.resolve(process.cwd(), options.outputDir)
    : findExistingPath('reports/playwright', 'playwright-report');

  if (!resolvedPwDir || !fs.existsSync(resolvedPwDir)) {
    console.warn(`\n⚠️  Playwright rapor dizini bulunamadı (reports/playwright veya playwright-report)`);
    console.warn(`Lütfen önce testlerinizi çalıştırın: npx testfly test\n`);
    return;
  }

  console.log(`\n🎭 Opening Playwright HTML Report: ${resolvedPwDir}...`);
  const child = spawn(`npx playwright show-report "${resolvedPwDir}"`, {
    shell: true,
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    console.error('Playwright raporu açılamadı:', err);
  });
}
