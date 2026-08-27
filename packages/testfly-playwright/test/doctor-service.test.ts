import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DoctorService } from '../src/doctor/DoctorService';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('DoctorService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-doctor-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should report missing configs and healthy node version', async () => {
    const checks = await DoctorService.diagnose(tempDir);
    expect(checks.length).toBeGreaterThan(0);

    const nodeCheck = checks.find((c) => c.name === 'Node.js Runtime');
    expect(nodeCheck?.status).toBe('pass');

    const pwCheck = checks.find((c) => c.name === 'Playwright Config');
    expect(pwCheck?.status).toBe('fail');
  });

  it('should report passing when all files are in place', async () => {
    fs.writeFileSync(path.join(tempDir, 'playwright.config.ts'), '', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'testfly.config.ts'), '', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '', 'utf8');
    fs.mkdirSync(path.join(tempDir, '.agents', 'skills', 'testfly-bdd'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.agents', 'skills', 'testfly-bdd', 'SKILL.md'), '', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'features'));
    fs.mkdirSync(path.join(tempDir, 'steps'));

    const checks = await DoctorService.diagnose(tempDir);
    const pwCheck = checks.find((c) => c.name === 'Playwright Config');
    expect(pwCheck?.status).toBe('pass');

    const tfCheck = checks.find((c) => c.name === 'TestFly Config');
    expect(tfCheck?.status).toBe('pass');

    const agentCheck = checks.find((c) => c.name === 'Agentic BDD Guidelines');
    expect(agentCheck?.status).toBe('pass');
  });
});
