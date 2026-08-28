import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestDataManager } from '../src/context/TestDataManager';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('TestDataManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testfly-testdata-'));
    const dataDir = path.join(tempDir, 'data');
    fs.mkdirSync(dataDir);

    fs.writeFileSync(
      path.join(dataDir, 'users.json'),
      JSON.stringify({
        admin: { username: 'admin_user', role: 'administrator' },
        guest: { username: 'guest_user', role: 'viewer' },
      }),
      'utf8'
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should auto-load json data files and query with dot-notation', () => {
    const manager = new TestDataManager(tempDir);

    expect(manager.get('users.admin.username')).toBe('admin_user');
    expect(manager.get('users.admin.role')).toBe('administrator');
    expect(manager.get('users.guest.role')).toBe('viewer');
    expect(manager.get('users.unknown', 'defaultVal')).toBe('defaultVal');
  });

  it('should allow setting in-memory data', () => {
    const manager = new TestDataManager(tempDir);
    manager.set('custom', { count: 42 });

    expect(manager.get('custom.count')).toBe(42);
  });
});
