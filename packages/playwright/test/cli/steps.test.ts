import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StepScanner } from '../../src/cli/scanner/StepScanner';
import { runStepsCommand } from '../../src/cli/steps';
import { capture } from '../helpers/capture';
import { cleanupTmp, makeTmp, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

const FEATURE = `Feature: User Login
  Scenario: Login Flow
    Given the user is on the login page
    When the user enters "admin" and "pass123"
    And waits 5 seconds
    Then the dashboard opens
    Then the dashboard opens
`;

const STEPS = `import { Given, When } from '@testfly/playwright/bdd';
Given('the user is on the login page', async () => {});
When('the user enters {string} and {string}', async ({}, a: string, b: string) => {});
`;

function project(): string {
  const dir = makeTmp();
  writeFiles(dir, { 'features/login.feature': FEATURE, 'steps/login.steps.ts': STEPS });
  return dir;
}

describe('StepScanner', () => {
  it('extracts feature steps with keyword and line number', () => {
    const dir = project();
    const steps = StepScanner.extractFeatureSteps(path.join(dir, 'features'));
    expect(steps.map((s) => s.keyword)).toEqual(['Given', 'When', 'And', 'Then', 'Then']);
    expect(steps[1]).toMatchObject({ text: 'the user enters "admin" and "pass123"', line: 4 });
  });

  it('extracts defined step patterns of all quote kinds', () => {
    const dir = makeTmp();
    writeFiles(dir, {
      'steps/a.ts': `Given('it\\'s ok', async () => {});\nWhen("double {int}", async () => {});\nThen(\`tick\`, async () => {});\nStep('any', async () => {});\n// Given('commented out' is still picked up by design\n`,
    });
    const defined = StepScanner.extractDefinedSteps(path.join(dir, 'steps'));
    expect(defined).toEqual(expect.arrayContaining(["it's ok", 'double {int}', 'tick', 'any']));
  });

  it('returns nothing for missing directories', () => {
    expect(StepScanner.extractFeatureSteps('/definitely/not/here')).toEqual([]);
    expect(StepScanner.extractDefinedSteps('/definitely/not/here')).toEqual([]);
  });

  it('finds unmapped steps once each and suggests typed snippets', () => {
    const dir = project();
    const unmapped = StepScanner.findUnmappedSteps(path.join(dir, 'features'), path.join(dir, 'steps'));
    expect(unmapped.map((u) => u.step.text)).toEqual(['waits 5 seconds', 'the dashboard opens']);
    expect(unmapped[0]!.suggestedCode).toContain("When('waits {int} seconds', async ({ page, step }, count1: number) => {");
    expect(unmapped[0]!.suggestedCode).toContain("await step.info('waits 5 seconds');");
    expect(unmapped[1]!.suggestedCode.startsWith("Then('the dashboard opens'")).toBe(true);
  });

  it('matches cucumber expressions case-insensitively and does not treat regex chars specially', () => {
    const dir = makeTmp();
    writeFiles(dir, {
      'features/a.feature': 'Feature: x\n  Scenario: s\n    Given Price is (10) USD\n    When I pay 3.5 now\n    Then total is "a"\n',
      'steps/a.ts': "Given('price is (10) usd', async () => {});\nWhen('I pay {float} now', async () => {});\nThen('total is {string}', async () => {});\n",
    });
    expect(StepScanner.findUnmappedSteps(path.join(dir, 'features'), path.join(dir, 'steps'))).toEqual([]);
  });

  it('escapes quotes when generating snippets', () => {
    const snippet = StepScanner.generateStepSnippet({ keyword: 'Given', text: "it's a day", fullText: "Given it's a day", file: 'f', line: 1 });
    expect(snippet).toContain("Given('it\\'s a day'");
    expect(snippet).toContain("throw new Error('Step not implemented: it\\'s a day');");
  });

  it('generates stubs that fail loudly until implemented', async () => {
    const snippet = StepScanner.generateStepSnippet({ keyword: 'When', text: 'waits 5 seconds', fullText: 'When waits 5 seconds', file: 'f', line: 1 });
    expect(snippet).toContain("throw new Error('Step not implemented: waits 5 seconds');");
    // Evaluate the generated body: it must reject, never pass silently.
    const body = snippet.slice(snippet.indexOf('async ('), snippet.lastIndexOf(')'));
    const impl = new Function(`return (${body.replace(/: number/g, '')});`)() as (fixtures: unknown, count1: number) => Promise<void>;
    const infos: string[] = [];
    await expect(impl({ page: {}, step: { info: async (m: string) => void infos.push(m) } }, 5)).rejects.toThrow('Step not implemented: waits 5 seconds');
    expect(infos).toEqual(['waits 5 seconds']);
  });
});

describe('testfly steps', () => {
  it('exits 0 when everything is mapped', async () => {
    const dir = makeTmp();
    writeFiles(dir, { 'features/a.feature': 'Feature: x\n  Scenario: s\n    Given ok\n', 'steps/a.ts': "Given('ok', async () => {});" });
    const { result, logs } = await capture(() => runStepsCommand({ cwd: dir }));
    expect(result).toBe(0);
    expect(logs.join('\n')).toContain('All feature steps have a matching step definition.');
  });

  it('exits 1 and lists unmapped steps', async () => {
    const dir = project();
    const { result, logs } = await capture(() => runStepsCommand({ cwd: dir }));
    expect(result).toBe(1);
    const out = logs.join('\n');
    expect(out).toContain('2 step(s) without definition');
    expect(out).toContain('And waits 5 seconds');
    expect(out).toContain('npx testfly steps --scaffold');
  });

  it('--scaffold writes stubs and appends on later runs', async () => {
    const dir = project();
    const { result } = await capture(() => runStepsCommand({ cwd: dir, scaffold: true }));
    expect(result).toBe(0);
    const file = path.join(dir, 'steps', 'unmapped.steps.ts');
    const text = fs.readFileSync(file, 'utf8');
    expect(text.startsWith("import { Given, When, Then } from '@testfly/playwright/bdd';")).toBe(true);
    expect(text).toContain("Then('the dashboard opens'");
    // The generated stubs now satisfy the scanner.
    const again = await capture(() => runStepsCommand({ cwd: dir }));
    expect(again.result).toBe(0);
  });
});
