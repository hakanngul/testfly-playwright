import fs from 'fs';
import path from 'path';

export interface FeatureStepItem {
  keyword: string; // Given, When, Then, And, But
  text: string; // The step sentence without keyword
  fullText: string;
  file: string;
  line: number;
}

export interface UnmappedStepResult {
  step: FeatureStepItem;
  suggestedCode: string;
}

export class StepScanner {
  /**
   * Extract all Gherkin steps from .feature files in a directory
   */
  static extractFeatureSteps(featuresDir: string): FeatureStepItem[] {
    const steps: FeatureStepItem[] = [];
    if (!fs.existsSync(featuresDir)) return steps;

    const files = this.getAllFiles(featuresDir, '.feature');

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const match = trimmed.match(/^(Given|When|Then|And|But)\s+(.+)$/);
        if (match) {
          steps.push({
            keyword: match[1],
            text: match[2].trim(),
            fullText: trimmed,
            file: path.relative(process.cwd(), file),
            line: i + 1,
          });
        }
      }
    }

    return steps;
  }

  /**
   * Extract defined step strings/patterns from steps/*.steps.ts files
   */
  static extractDefinedSteps(stepsDir: string): string[] {
    const defined: string[] = [];
    if (!fs.existsSync(stepsDir)) return defined;

    const files = this.getAllFiles(stepsDir, '.ts');

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      // Matches Given('...', When("...", Then(`...`
      const matches = content.matchAll(/(?:Given|When|Then)\s*\(\s*['"`](.*?)['"`]/g);
      for (const m of matches) {
        if (m[1]) {
          defined.push(m[1]);
        }
      }
    }

    return defined;
  }

  /**
   * Find steps present in .feature files that have no matching step definition
   */
  static findUnmappedSteps(featuresDir: string, stepsDir: string): UnmappedStepResult[] {
    const featureSteps = this.extractFeatureSteps(featuresDir);
    const definedPatterns = this.extractDefinedSteps(stepsDir);

    const unmapped: UnmappedStepResult[] = [];
    const seenTexts = new Set<string>();

    for (const fStep of featureSteps) {
      const isMatched = definedPatterns.some((pattern) => this.matchStep(fStep.text, pattern));

      if (!isMatched && !seenTexts.has(fStep.text)) {
        seenTexts.add(fStep.text);
        unmapped.push({
          step: fStep,
          suggestedCode: this.generateStepSnippet(fStep),
        });
      }
    }

    return unmapped;
  }

  /**
   * Convert Gherkin text to a TypeScript step snippet with typed parameters
   */
  static generateStepSnippet(step: FeatureStepItem): string {
    const keyword = ['And', 'But'].includes(step.keyword) ? 'When' : step.keyword;
    let pattern = step.text;
    const params: { name: string; type: string }[] = [];

    // Replace quoted strings "value" -> {string}
    let stringIndex = 1;
    pattern = pattern.replace(/"([^"]+)"/g, () => {
      params.push({ name: `param${stringIndex++}`, type: 'string' });
      return '{string}';
    });

    // Replace integers \b\d+\b -> {int}
    let intIndex = 1;
    pattern = pattern.replace(/\b\d+\b/g, () => {
      params.push({ name: `count${intIndex++}`, type: 'number' });
      return '{int}';
    });

    const paramArgs = params.length > 0 ? `, ${params.map((p) => `${p.name}: ${p.type}`).join(', ')}` : '';
    const fixtureArgs = '{ page, step }';

    return `${keyword}('${pattern}', async (${fixtureArgs}${paramArgs}) => {
  await step.info('${step.text}');
  // TODO: implement step definition
});`;
  }

  private static matchStep(stepText: string, pattern: string): boolean {
    // Convert cucumber expressions {string}, {int} into regex
    const regexStr = pattern
      .replace(/\{string\}/g, '"[^"]+"')
      .replace(/\{int\}/g, '\\d+')
      .replace(/\{float\}/g, '\\d+(?:\\.\\d+)?')
      .replace(/\{word\}/g, '\\w+');

    try {
      const regex = new RegExp(`^${regexStr}$`, 'i');
      return regex.test(stepText) || stepText === pattern;
    } catch {
      return stepText.includes(pattern);
    }
  }

  private static getAllFiles(dir: string, ext: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);

    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(this.getAllFiles(fullPath, ext));
      } else if (file.endsWith(ext)) {
        results.push(fullPath);
      }
    }

    return results;
  }
}
