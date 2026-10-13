/** Payload of a run notification. @internal */
export interface NotificationPayload {
  title: string;
  status: 'passed' | 'failed' | 'running';
  totalTests?: number;
  passedTests?: number;
  failedTests?: number;
  duration?: string;
  reportUrl?: string;
}

/** Posts run summaries to chat webhooks. @internal */
export class NotificationManager {
  /**
   * Send notification to Slack incoming webhook
   */
  static async sendSlack(webhookUrl: string, payload: NotificationPayload): Promise<boolean> {
    const isPassed = payload.status === 'passed';
    const color = isPassed ? '#36a64f' : '#e01e5a';
    const statusLabel = isPassed ? 'PASSED' : 'FAILED';

    const body = {
      attachments: [
        {
          color,
          title: `[${statusLabel}] TestFly Suite: ${payload.title}`,
          text: `Status: *${payload.status.toUpperCase()}* | Duration: *${payload.duration || 'N/A'}*\nTotal: *${payload.totalTests || 0}* | Passed: *${payload.passedTests || 0}* | Failed: *${payload.failedTests || 0}*`,
          actions: payload.reportUrl
            ? [
                {
                  type: 'button',
                  text: 'View report',
                  url: payload.reportUrl,
                  style: isPassed ? 'primary' : 'danger',
                },
              ]
            : undefined,
        },
      ],
    };

    return await this.postJson(webhookUrl, body);
  }

  /**
   * Send notification to Discord webhook
   */
  static async sendDiscord(webhookUrl: string, payload: NotificationPayload): Promise<boolean> {
    const isPassed = payload.status === 'passed';
    const color = isPassed ? 3066993 : 15158332; // Green / Red

    const body = {
      embeds: [
        {
          title: `[${isPassed ? 'PASSED' : 'FAILED'}] TestFly Run: ${payload.title}`,
          color,
          fields: [
            { name: 'Status', value: payload.status.toUpperCase(), inline: true },
            { name: 'Duration', value: payload.duration || 'N/A', inline: true },
            {
              name: 'Results',
              value: `Total: ${payload.totalTests || 0} | Passed: ${payload.passedTests || 0} | Failed: ${payload.failedTests || 0}`,
              inline: false,
            },
          ],
          url: payload.reportUrl,
        },
      ],
    };

    return await this.postJson(webhookUrl, body);
  }

  /**
   * Send notification to MS Teams webhook
   */
  static async sendTeams(webhookUrl: string, payload: NotificationPayload): Promise<boolean> {
    const isPassed = payload.status === 'passed';
    const themeColor = isPassed ? '00FF00' : 'FF0000';

    const body = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor,
      summary: `TestFly: ${payload.title}`,
      sections: [
        {
          activityTitle: `[${isPassed ? 'PASSED' : 'FAILED'}] TestFly Suite: ${payload.title}`,
          activitySubtitle: `Status: ${payload.status.toUpperCase()} (${payload.duration || 'N/A'})`,
          facts: [
            { name: 'Total tests', value: String(payload.totalTests || 0) },
            { name: 'Passed', value: String(payload.passedTests || 0) },
            { name: 'Failed', value: String(payload.failedTests || 0) },
          ],
          potentialAction: payload.reportUrl
            ? [
                {
                  '@type': 'OpenUri',
                  name: 'Open report',
                  targets: [{ os: 'default', uri: payload.reportUrl }],
                },
              ]
            : undefined,
        },
      ],
    };

    return await this.postJson(webhookUrl, body);
  }

  private static async postJson(url: string, data: any): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
