import fs from 'fs';
import path from 'path';

export interface CleanOptions {
  cwd?: string;
  all?: boolean;
}

export async function runClean(options: CleanOptions = {}): Promise<void> {
  const targetDir = options.cwd || process.cwd();
  console.log(`\n🧹 Cleaning generated test artifacts & reports in: ${targetDir}\n`);

  const pathsToClean = [
    'reports',
    '.features-gen',
    'allure-results',
    'allure-report',
    'playwright-report',
    'cucumber-report',
    'test-results',
    '.playwright',
  ];

  let cleanedCount = 0;

  for (const item of pathsToClean) {
    const fullPath = path.join(targetDir, item);
    if (fs.existsSync(fullPath)) {
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`  🗑️  Removed: ${item}/`);
        cleanedCount++;
      } catch (err) {
        console.warn(`  ⚠️  Failed to remove ${item}:`, err);
      }
    }
  }

  if (cleanedCount === 0) {
    console.log(`  ✨ Everything is already clean. Nothing to remove.`);
  } else {
    console.log(`\n✨ Clean completed successfully! (${cleanedCount} directories removed)\n`);
  }
}
