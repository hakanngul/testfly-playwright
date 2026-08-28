import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocatorTypeGen } from '../src/locators/LocatorTypeGen';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('LocatorTypeGen', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-locators-'));
    fs.writeFileSync(
      path.join(tempDir, 'login.yaml'),
      `username_field:\n  type: label\n  value: "Username"\nlogin_btn:\n  type: role\n  role: button\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(tempDir, 'dashboard.yaml'),
      `logout_btn:\n  type: text\n  value: "Çıkış"\n`,
      'utf8'
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should generate valid TypeScript declarations for all locator keys', () => {
    const outFile = path.join(tempDir, 'index.d.ts');
    const result = LocatorTypeGen.generateToFile(tempDir, outFile);

    expect(result.count).toBe(3);
    expect(fs.existsSync(outFile)).toBe(true);

    const content = fs.readFileSync(outFile, 'utf8');
    expect(content).toContain("'login.username_field'");
    expect(content).toContain("'login.login_btn'");
    expect(content).toContain("'dashboard.logout_btn'");
    expect(content).toContain('export type TestFlyLocatorKey');
  });
});
