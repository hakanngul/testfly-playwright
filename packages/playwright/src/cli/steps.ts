import fs from 'node:fs';
import path from 'node:path';
import { StepScanner } from './scanner/StepScanner';
import { log } from './util';

/** Options of `testfly steps`. @internal */
export interface StepsOptions {
  scaffold?: boolean;
  features?: string;
  steps?: string;
  cwd?: string;
}

/** Report (and optionally scaffold) feature steps without definitions. Returns the exit code. @internal */
export async function runStepsCommand(options: StepsOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const featuresDir = path.resolve(cwd, options.features ?? 'features');
  const stepsDir = path.resolve(cwd, options.steps ?? 'steps');

  const unmapped = StepScanner.findUnmappedSteps(featuresDir, stepsDir);
  if (unmapped.length === 0) {
    log('All feature steps have a matching step definition.');
    return 0;
  }

  log(`${unmapped.length} step(s) without definition:\n`);
  for (const item of unmapped) log(`  ${item.step.file}:${item.step.line}  ${item.step.fullText}`);

  if (!options.scaffold) {
    log('\nGenerate TypeScript stubs with: npx testfly steps --scaffold');
    return 1;
  }

  const file = path.join(stepsDir, 'unmapped.steps.ts');
  fs.mkdirSync(stepsDir, { recursive: true });
  const header = fs.existsSync(file) ? `${fs.readFileSync(file, 'utf8').trimEnd()}\n\n` : `import { Given, When, Then } from '@testfly/playwright/bdd';\n\n`;
  fs.writeFileSync(file, `${header}${unmapped.map((u) => u.suggestedCode).join('\n\n')}\n`, 'utf8');
  log(`\nWrote ${unmapped.length} stub(s) to ${path.relative(cwd, file)}`);
  return 0;
}
