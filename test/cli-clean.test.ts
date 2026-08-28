import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runClean } from '../src/cli/clean';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('CLI Clean Command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-clean-'));
    fs.mkdirSync(path.join(tempDir, 'reports'));
    fs.mkdirSync(path.join(tempDir, 'allure-results'));
    fs.mkdirSync(path.join(tempDir, 'test-results'));
    fs.writeFileSync(path.join(tempDir, 'reports', 'test.txt'), 'data');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should remove test reports and temporary artifact folders', async () => {
    expect(fs.existsSync(path.join(tempDir, 'reports'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'allure-results'))).toBe(true);

    await runClean({ cwd: tempDir });

    expect(fs.existsSync(path.join(tempDir, 'reports'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'allure-results'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'test-results'))).toBe(false);
  });
});
