import { describe, it, expect, vi } from 'vitest';
import { NotificationManager } from '../src/notifications/NotificationManager';

describe('NotificationManager', () => {
  it('should format Slack message and send webhook', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as any);

    const success = await NotificationManager.sendSlack('https://hooks.slack.com/services/test', {
      title: 'Regression Suite',
      status: 'passed',
      totalTests: 10,
      passedTests: 10,
      failedTests: 0,
      duration: '5s',
      reportUrl: 'https://example.com/allure',
    });

    expect(success).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
