import fs from 'fs';
import path from 'path';
import { StepScanner } from '../scanner/StepScanner';

export interface StepsOptions {
  scaffold?: boolean;
  features?: string;
  steps?: string;
  cwd?: string;
}

export async function runStepsCommand(options: StepsOptions = {}): Promise<void> {
  const targetDir = options.cwd || process.cwd();
  const featuresDir = path.resolve(targetDir, options.features || 'features');
  const stepsDir = path.resolve(targetDir, options.steps || 'steps');

  console.log(`\n🔍 Scanning BDD feature and step definitions in: ${targetDir}\n`);

  const unmapped = StepScanner.findUnmappedSteps(featuresDir, stepsDir);

  if (unmapped.length === 0) {
    console.log(`✨ Harika! Tüm BDD adımları (\`.feature\`) tanımlı step fonksiyonları ile eşleşiyor. (0 eksik adım)\n`);
    return;
  }

  console.log(`⚠️  ${unmapped.length} adet eksik/eşleşmeyen BDD adımı tespit edildi:\n`);

  for (const item of unmapped) {
    console.log(`  📌 [${item.step.file}:${item.step.line}] "${item.step.fullText}"`);
  }

  if (options.scaffold) {
    const unmappedFilePath = path.join(stepsDir, 'unmapped.steps.ts');
    let fileContent = `import { Given, When, Then, expect } from '@testfly/playwright';\n\n`;

    if (fs.existsSync(unmappedFilePath)) {
      fileContent = fs.readFileSync(unmappedFilePath, 'utf8') + '\n\n';
    }

    const snippets = unmapped.map((u) => u.suggestedCode).join('\n\n');
    fs.writeFileSync(unmappedFilePath, fileContent + snippets + '\n', 'utf8');

    console.log(`\n🎉 ${unmapped.length} eksik adım TypeScript iskeleti olarak kaydedildi:`);
    console.log(`  📄 Created/Updated: ${path.relative(targetDir, unmappedFilePath)}\n`);
  } else {
    console.log(`\n💡 İpucu: Bu adımların TypeScript iskeletini otomatik üretmek için:`);
    console.log(`  npx testfly steps --scaffold\n`);
  }
}
