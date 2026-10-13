import { describe, expect, it } from 'vitest';
import { CONTENT_TYPES } from '@testfly/reporter/schema';
import { StepLogger } from '../../src/core/steps/StepLogger';
import { fakeTestInfo } from '../helpers/fakeTestInfo';

// `test.step` only works inside a running Playwright test; its behaviour with a real test is covered by
// e2e/step.spec.ts. Here we cover the pure recording/flush logic with `attach` and `events`.
describe('StepLogger (recording and flush)', () => {
  it('flush does nothing when no events were recorded', async () => {
    const info = fakeTestInfo();
    await new StepLogger(info).flush();
    expect(info.attachments_).toHaveLength(0);
  });

  it('attach forwards to testInfo.attach', async () => {
    const info = fakeTestInfo();
    const api = new StepLogger(info).toApi();
    await api.attach('note', 'hello', 'text/plain');
    await api.attach('default-type', 'x');
    expect(info.attachments_).toEqual([
      { name: 'note', body: 'hello', contentType: 'text/plain' },
      { name: 'default-type', body: 'x', contentType: 'text/plain' },
    ]);
  });

  it('exposes a callable api with all level methods and an events() copy', () => {
    const api = new StepLogger(fakeTestInfo()).toApi();
    expect(typeof api).toBe('function');
    for (const name of ['info', 'pass', 'warn', 'fail', 'attach', 'events'] as const) expect(typeof api[name]).toBe('function');
    expect(api.events()).toEqual([]);
    expect(CONTENT_TYPES.step).toBeTruthy();
  });
});
