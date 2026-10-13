import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { StepScanner } from '../scanner/StepScanner';
import { findPlaywrightConfig, usesBdd } from '../util';

/** One diagnostic result. @internal */
export interface DoctorCheckItem {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  solution?: string;
}

function resolvePackageVersion(name: string, cwd: string): string | undefined {
  try {
    const req = createRequire(path.join(cwd, 'noop.js'));
    const pkgPath = req.resolve(`${name}/package.json`);
    return (JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

/**
 * Project health checks behind `testfly doctor`.
 * @internal
 */
export class DoctorService {
  static async diagnose(cwd: string = process.cwd()): Promise<DoctorCheckItem[]> {
    const checks: DoctorCheckItem[] = [];

    const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
    checks.push(
      nodeMajor >= 22
        ? { name: 'Node.js', status: 'pass', message: `v${process.versions.node}` }
        : { name: 'Node.js', status: 'fail', message: `v${process.versions.node} (Node >= 22 required)`, solution: 'Upgrade Node.js: https://nodejs.org' },
    );

    const pwVersion = resolvePackageVersion('@playwright/test', cwd);
    if (!pwVersion) {
      checks.push({ name: '@playwright/test', status: 'fail', message: 'not installed', solution: 'npm i -D @playwright/test' });
    } else {
      const major = Number.parseInt(pwVersion.split('.')[0] ?? '0', 10);
      const minor = Number.parseInt(pwVersion.split('.')[1] ?? '0', 10);
      const ok = major === 1 && minor >= 50;
      checks.push(
        ok
          ? { name: '@playwright/test', status: 'pass', message: `v${pwVersion}` }
          : { name: '@playwright/test', status: 'fail', message: `v${pwVersion} (>= 1.50 and < 2 required)`, solution: 'npm i -D @playwright/test@latest' },
      );
    }

    const configFile = findPlaywrightConfig(cwd);
    if (!configFile) {
      checks.push({ name: 'Playwright config', status: 'fail', message: 'playwright.config.* not found', solution: 'npx testfly init' });
    } else {
      const text = fs.readFileSync(configFile, 'utf8');
      checks.push({ name: 'Playwright config', status: 'pass', message: path.basename(configFile) });
      checks.push(
        /@testfly\/playwright\/config/.test(text)
          ? { name: 'TestFly config', status: 'pass', message: 'defineConfig from @testfly/playwright/config' }
          : {
              name: 'TestFly config',
              status: 'warn',
              message: 'the config does not use defineConfig from @testfly/playwright/config (TestFly options will be defaults)',
              solution: "import { defineConfig } from '@testfly/playwright/config' and move options under `testfly: {}`",
            },
      );
      if (fs.existsSync(path.join(cwd, 'testfly.config.ts'))) {
        checks.push({
          name: 'Legacy config',
          status: 'warn',
          message: 'testfly.config.ts is no longer read',
          solution: 'Move its options into the `testfly` key of playwright.config.ts and delete the file',
        });
      }
    }

    const reporterVersion = resolvePackageVersion('@testfly/reporter', cwd);
    checks.push(
      reporterVersion
        ? { name: '@testfly/reporter', status: 'pass', message: `v${reporterVersion}` }
        : { name: '@testfly/reporter', status: 'warn', message: 'not resolvable from the project', solution: 'npm i -D @testfly/reporter (or set testfly.reporter.enabled to false)' },
    );

    const locatorsDir = path.join(cwd, 'locators');
    if (fs.existsSync(locatorsDir)) {
      const count = fs.readdirSync(locatorsDir).filter((f) => /\.(ya?ml|json)$/i.test(f)).length;
      checks.push({ name: 'Locators', status: 'pass', message: `${count} catalog file(s) in locators/` });
    } else {
      checks.push({ name: 'Locators', status: 'warn', message: 'locators/ directory not found (only needed for locate())', solution: 'Create locators/<page>.yaml' });
    }

    if (usesBdd(configFile)) {
      const featuresDir = path.join(cwd, 'features');
      const stepsDir = path.join(cwd, 'steps');
      if (fs.existsSync(featuresDir) && fs.existsSync(stepsDir)) {
        const unmapped = StepScanner.findUnmappedSteps(featuresDir, stepsDir);
        checks.push(
          unmapped.length === 0
            ? { name: 'BDD steps', status: 'pass', message: 'all feature steps have a definition' }
            : { name: 'BDD steps', status: 'warn', message: `${unmapped.length} step(s) without definition`, solution: 'npx testfly steps --scaffold' },
        );
      } else {
        checks.push({ name: 'BDD steps', status: 'warn', message: 'features/ or steps/ directory missing', solution: 'Create them or adjust testfly.bdd in the config' });
      }
    }

    return checks;
  }
}
