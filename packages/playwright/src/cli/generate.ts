import fs from 'node:fs';
import path from 'node:path';
import { OpenApiGenerator } from './generator/OpenApiGenerator';
import { log, warn } from './util';

/** Options of `testfly generate`. @internal */
export interface GenerateOptions {
  swagger?: string;
  outputDir?: string;
  cwd?: string;
}

/** Generate BDD features and generic API steps from an OpenAPI document. Returns the exit code. @internal */
export async function runGenerate(options: GenerateOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const source = options.swagger;
  if (!source) {
    warn('Provide an OpenAPI/Swagger file or URL: testfly generate --swagger ./openapi.json');
    return 2;
  }

  let spec: Record<string, unknown>;
  try {
    if (/^https?:\/\//.test(source)) {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      spec = (await res.json()) as Record<string, unknown>;
    } else {
      const file = path.resolve(cwd, source);
      if (!fs.existsSync(file)) {
        warn(`File not found: ${file}`);
        return 1;
      }
      const raw = fs.readFileSync(file, 'utf8');
      if (/\.ya?ml$/i.test(file)) {
        const YAML = await import('yaml');
        spec = YAML.parse(raw) as Record<string, unknown>;
      } else {
        spec = JSON.parse(raw) as Record<string, unknown>;
      }
    }
  } catch (error) {
    warn(`Could not read the OpenAPI document: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const featuresDir = path.resolve(cwd, options.outputDir ?? 'features');
  const stepsDir = path.resolve(cwd, 'steps');
  fs.mkdirSync(featuresDir, { recursive: true });
  fs.mkdirSync(stepsDir, { recursive: true });

  const features = OpenApiGenerator.generateFeatures(spec);
  log(`Generated ${features.length} feature file(s):`);
  for (const feature of features) {
    const file = path.join(featuresDir, feature.fileName);
    fs.writeFileSync(file, feature.content, 'utf8');
    log(`  ${path.relative(cwd, file)}`);
  }

  const stepsFile = path.join(stepsDir, 'api-generated.steps.ts');
  if (!fs.existsSync(stepsFile)) {
    fs.writeFileSync(stepsFile, OpenApiGenerator.generateApiSteps(), 'utf8');
    log(`  ${path.relative(cwd, stepsFile)}`);
  }
  log('\nRun them with: npx testfly test --grep @api');
  return 0;
}
