import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestContext } from '../../src/core/context';
import { TestFlyError } from '../../src/core/errors';
import { cleanupTmp, makeTmp } from '../helpers/tmp';

let dir = '';
beforeAll(async () => {
  dir = makeTmp();
  const wb = new ExcelJS.Workbook();
  const users = wb.addWorksheet('users');
  users.addRow(['email', 'password', 'age']);
  users.addRow(['ada@example.com', 's3cret', 36]);
  users.addRow([]); // empty rows are skipped
  users.addRow(['bob@example.com', 'hunter2', 41]);
  const other = wb.addWorksheet('locked');
  other.addRow(['email']);
  other.addRow(['locked@example.com']);
  await wb.xlsx.writeFile(path.join(dir, 'accounts.xlsx'));
});
afterAll(() => cleanupTmp());


describe('TestContext.loadExcel', () => {
  it('reads the first worksheet as records (header row, text values, empty rows skipped) and stores them', async () => {
    const ctx = new TestContext({ baseDir: dir });
    const rows = await ctx.loadExcel('accounts.xlsx');
    expect(rows).toEqual([
      { email: 'ada@example.com', password: 's3cret', age: '36' },
      { email: 'bob@example.com', password: 'hunter2', age: '41' },
    ]);
    expect(ctx.get('accounts.1.email')).toBe('bob@example.com');
  });

  it('selects a worksheet by name or index and honours the namespace', async () => {
    const ctx = new TestContext({ baseDir: dir });
    expect(await ctx.loadExcel('accounts.xlsx', { sheet: 'locked', namespace: 'locked' })).toEqual([{ email: 'locked@example.com' }]);
    expect(await ctx.loadExcel('accounts.xlsx', { sheet: 1 })).toEqual([{ email: 'locked@example.com' }]);
    expect(ctx.get('locked.0.email')).toBe('locked@example.com');
  });

  it('fails with TF_DATA_FILE_INVALID for a missing sheet or file', async () => {
    const ctx = new TestContext({ baseDir: dir });
    const missingSheet = await ctx.loadExcel('accounts.xlsx', { sheet: 'nope' }).catch((e: TestFlyError) => e);
    expect(missingSheet).toMatchObject({ code: 'TF_DATA_FILE_INVALID' });
    expect((missingSheet as TestFlyError).hint).toContain('users, locked');
    await expect(ctx.loadExcel('missing.xlsx')).rejects.toMatchObject({ code: 'TF_DATA_FILE_INVALID' });
  });
});
