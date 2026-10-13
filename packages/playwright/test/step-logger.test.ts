import { describe, it, expect, vi } from 'vitest';
import { StepLogger } from '../src/core/steps/StepLogger';



describe('StepLogger', () => {
  it('should record info, warn, error, and step entries', async () => {
    const logger = new StepLogger();

    await logger.info('Initializing test step', { user: 'tester' });
    await logger.warn('Resource warning');
    await logger.error('Failure occurred', new Error('Timeout error'));

    const logs = logger.getLogs();
    expect(logs.length).toBe(3);
    expect(logs[0].level).toBe('INFO');
    expect(logs[0].message).toBe('Initializing test step');
    expect(logs[1].level).toBe('WARN');
    expect(logs[2].level).toBe('ERROR');

    logger.clear();
    expect(logger.getLogs().length).toBe(0);
  });
});
