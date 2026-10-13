import path from 'path';
import fs from 'fs';
import { LocatorTypeGen } from '../locators/LocatorTypeGen';
import { LocatorParser } from '../locators/LocatorParser';

export interface LocatorsCliOptions {
  dir?: string;
  output?: string;
}

export async function runLocatorsCommand(options: LocatorsCliOptions = {}): Promise<void> {
  const locatorsDir = path.resolve(process.cwd(), options.dir || 'locators');
  const outputFile = path.resolve(process.cwd(), options.output || path.join('locators', 'index.d.ts'));

  console.log(`\n🔍 Scanning YAML/JSON locator files in: ${locatorsDir}\n`);

  if (!fs.existsSync(locatorsDir)) {
    console.log(`⚠️  "${locatorsDir}" klasörü bulunamadı.`);
    console.log(`💡 İpucu: Sayfa seçicilerinizi "locators/login.yaml" şeklinde oluşturabilirsiniz.\n`);
    return;
  }

  const items = LocatorParser.parseDirectory(locatorsDir);
  console.log(`📦 ${items.length} adet seçici tanımlandı:`);

  for (const item of items) {
    console.log(`  🎯 [${item.fullKey}] (${(item.definition as any).type || 'custom'})`);
  }

  const result = LocatorTypeGen.generateToFile(locatorsDir, outputFile);
  console.log(`\n✨ TypeScript Tip Tanımları Başarıyla Üretildi:`);
  console.log(`  📄 Created: ${path.relative(process.cwd(), result.outputPath)}\n`);
}
