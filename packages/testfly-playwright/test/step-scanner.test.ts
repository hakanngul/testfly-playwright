import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StepScanner } from '../src/scanner/StepScanner';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('StepScanner', () => {
  let tempDir: string;
  let featuresDir: string;
  let stepsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-scanner-'));
    featuresDir = path.join(tempDir, 'features');
    stepsDir = path.join(tempDir, 'steps');
    fs.mkdirSync(featuresDir);
    fs.mkdirSync(stepsDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should detect unmapped steps between features and steps files', () => {
    const featureContent = `Feature: User Login
  Scenario: Login Flow
    Given kullanıcı giriş sayfasında
    When kullanıcı "admin" adı ve "pass123" şifresini girer
    Then ana sayfa açılır
`;
    fs.writeFileSync(path.join(featuresDir, 'login.feature'), featureContent, 'utf8');

    const stepsContent = `import { Given, When, Then } from '@testfly/playwright';
Given('kullanıcı giriş sayfasında', async () => {});
`;
    fs.writeFileSync(path.join(stepsDir, 'login.steps.ts'), stepsContent, 'utf8');

    const unmapped = StepScanner.findUnmappedSteps(featuresDir, stepsDir);
    expect(unmapped).toHaveLength(2);
    expect(unmapped[0].step.text).toBe('kullanıcı "admin" adı ve "pass123" şifresini girer');
    expect(unmapped[0].suggestedCode).toContain("When('kullanıcı {string} adı ve {string} şifresini girer'");
    expect(unmapped[1].step.text).toBe('ana sayfa açılır');
  });
});
