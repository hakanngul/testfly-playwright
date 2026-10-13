import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runInit } from '../src/cli/init';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('TestFly CLI Init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should scaffold a complete TestFly project in target directory', async () => {
    // initialize a minimal package.json in temp directory
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'my-app' }), 'utf8');

    await runInit({ cwd: tempDir, force: true });

    expect(fs.existsSync(path.join(tempDir, 'testfly.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'playwright.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.agents', 'skills', 'testfly-bdd', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'features', 'demo.feature'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'steps', 'demo.steps.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'tests', 'demo.spec.ts'))).toBe(true);

    const updatedPkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf8'));
    expect(updatedPkg.scripts['test']).toBe('testfly test');
    expect(updatedPkg.scripts['clean']).toBe('testfly clean');
    expect(updatedPkg.scripts['test:report']).toBe('testfly report');
    expect(updatedPkg.scripts['test:report:allure']).toBe('testfly report --allure');
  });
});
