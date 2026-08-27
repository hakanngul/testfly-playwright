export interface NotificationPayload {
  title: string;
  status: 'passed' | 'failed' | 'running';
  totalTests?: number;
  passedTests?: number;
  failedTests?: number;
  duration?: string;
  reportUrl?: string;
}

export class NotificationManager {
  /**
   * Send notification to Slack incoming webhook
   */
  static async sendSlack(webhookUrl: string, payload: NotificationPayload): Promise<boolean> {
    const isPassed = payload.status === 'passed';
    const color = isPassed ? '#36a64f' : '#e01e5a';
    const statusEmoji = isPassed ? '✅' : '❌';

    const body = {
      attachments: [
        {
          color,
          title: `${statusEmoji} TestFly Suite: ${payload.title}`,
          text: `Durum: *${payload.status.toUpperCase()}* | Süre: *${payload.duration || 'N/A'}*\nToplam: *${payload.totalTests || 0}* | Başarılı: *${payload.passedTests || 0}* | Hatalı: *${payload.failedTests || 0}*`,
          actions: payload.reportUrl
            ? [
                {
                  type: 'button',
                  text: '📊 Raporu Görüntüle',
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
          title: `${isPassed ? '✅' : '❌'} TestFly Run: ${payload.title}`,
          color,
          fields: [
            { name: 'Durum', value: payload.status.toUpperCase(), inline: true },
            { name: 'Süre', value: payload.duration || 'N/A', inline: true },
            {
              name: 'Sonuçlar',
              value: `Toplam: ${payload.totalTests || 0} | Başarılı: ${payload.passedTests || 0} | Hatalı: ${payload.failedTests || 0}`,
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
          activityTitle: `${isPassed ? '✅' : '❌'} TestFly Suite: ${payload.title}`,
          activitySubtitle: `Durum: ${payload.status.toUpperCase()} (${payload.duration || 'N/A'})`,
          facts: [
            { name: 'Toplam Test', value: String(payload.totalTests || 0) },
            { name: 'Başarılı', value: String(payload.passedTests || 0) },
            { name: 'Hatalı', value: String(payload.failedTests || 0) },
          ],
          potentialAction: payload.reportUrl
            ? [
                {
                  '@type': 'OpenUri',
                  name: '📊 Raporu Aç',
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
