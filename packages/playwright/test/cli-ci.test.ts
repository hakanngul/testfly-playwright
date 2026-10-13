import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCi } from '../src/cli/ci';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('CLI CI Command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-ci-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should generate GitHub Actions workflow YAML file', async () => {
    await runCi({ provider: 'github', cwd: tempDir });

    const githubYml = path.join(tempDir, '.github', 'workflows', 'testfly.yml');
    expect(fs.existsSync(githubYml)).toBe(true);

    const content = fs.readFileSync(githubYml, 'utf8');
    expect(content).toContain('TestFly Automation Suite');
    expect(content).toContain('npx testfly test');
  });

  it('should generate GitLab CI workflow YAML file', async () => {
    await runCi({ provider: 'gitlab', cwd: tempDir });

    const gitlabYml = path.join(tempDir, '.gitlab-ci.yml');
    expect(fs.existsSync(gitlabYml)).toBe(true);

    const content = fs.readFileSync(gitlabYml, 'utf8');
    expect(content).toContain('testfly_tests:');
    expect(content).toContain('npx testfly test');
  });
});
