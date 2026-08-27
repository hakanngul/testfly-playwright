import fs from 'fs';
import path from 'path';
import { OpenApiGenerator } from '../generator/OpenApiGenerator';

export interface GenerateOptions {
  swagger?: string;
  outputDir?: string;
  cwd?: string;
}

export async function runGenerate(options: GenerateOptions = {}): Promise<void> {
  const targetDir = options.cwd || process.cwd();
  const source = options.swagger;

  if (!source) {
    console.error(`\n❌ Hata: Lütfen bir Swagger / OpenAPI dosya yolu veya URL belirtin.`);
    console.log(`Örnek: npx testfly generate --swagger ./swagger.json`);
    console.log(`       npx testfly generate --swagger https://petstore.swagger.io/v2/swagger.json\n`);
    return;
  }

  console.log(`\n🔍 Loading Swagger/OpenAPI specification from: ${source}...`);

  let specObj: any = null;

  try {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const res = await fetch(source);
      specObj = await res.json();
    } else {
      const filePath = path.resolve(targetDir, source);
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Dosya bulunamadı: ${filePath}`);
        return;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      specObj = JSON.parse(raw);
    }
  } catch (err: any) {
    console.error(`❌ Swagger spesifikasyonu okunamadı:`, err.message || err);
    return;
  }

  const featuresDir = path.resolve(targetDir, options.outputDir || 'features');
  const stepsDir = path.resolve(targetDir, 'steps');

  if (!fs.existsSync(featuresDir)) fs.mkdirSync(featuresDir, { recursive: true });
  if (!fs.existsSync(stepsDir)) fs.mkdirSync(stepsDir, { recursive: true });

  const generatedFeatures = OpenApiGenerator.generateFeatures(specObj);

  console.log(`\n✨ Generated ${generatedFeatures.length} BDD feature file(s):`);

  for (const item of generatedFeatures) {
    const fullPath = path.join(featuresDir, item.fileName);
    fs.writeFileSync(fullPath, item.content, 'utf8');
    console.log(`  📄 Created feature: ${path.relative(targetDir, fullPath)}`);
  }

  // Create steps definition if not exists
  const stepsPath = path.join(stepsDir, 'api-generated.steps.ts');
  if (!fs.existsSync(stepsPath)) {
    fs.writeFileSync(stepsPath, OpenApiGenerator.generateApiSteps(), 'utf8');
    console.log(`  📄 Created step definitions: ${path.relative(targetDir, stepsPath)}`);
  }

  console.log(`\n🎉 Swagger to BDD generation completed successfully!`);
  console.log(`Testlerinizi çalıştırmak için:`);
  console.log(`  npx testfly test --grep @api\n`);
}
