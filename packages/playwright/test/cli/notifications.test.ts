import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotificationManager, type NotificationPayload } from '../../src/cli/notifications/NotificationManager';
import { startServer, type TestServer } from '../helpers/server';

let server: TestServer;
let requests: Array<{ method?: string; headers: Record<string, unknown>; body: any }> = [];
let status = 200;

beforeAll(async () => {
  server = await startServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      requests.push({ method: req.method, headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
      res.writeHead(status);
      res.end('ok');
    });
  });
});
afterAll(() => server.close());
beforeEach(() => {
  requests = [];
  status = 200;
});

const failed: NotificationPayload = { title: 'Regression', status: 'failed', totalTests: 10, passedTests: 7, failedTests: 3, duration: '5s', reportUrl: 'https://ci.example/report' };
const passed: NotificationPayload = { title: 'Smoke', status: 'passed' };

describe('NotificationManager', () => {
  it('posts a Slack attachment with colour, counts and a report button', async () => {
    expect(await NotificationManager.sendSlack(server.url, failed)).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe('POST');
    expect(requests[0]!.headers['content-type']).toBe('application/json');
    const [att] = requests[0]!.body.attachments;
    expect(att.color).toBe('#e01e5a');
    expect(att.title).toBe('[FAILED] TestFly Suite: Regression');
    expect(att.text).toContain('Total: *10* | Passed: *7* | Failed: *3*');
    expect(att.text).toContain('Duration: *5s*');
    expect(att.actions[0]).toMatchObject({ url: 'https://ci.example/report', style: 'danger', text: 'View report' });
  });

  it('uses green/primary for passed runs and defaults missing values', async () => {
    await NotificationManager.sendSlack(server.url, passed);
    const [att] = requests[0]!.body.attachments;
    expect(att.color).toBe('#36a64f');
    expect(att.title).toBe('[PASSED] TestFly Suite: Smoke');
    expect(att.text).toContain('Duration: *N/A*');
    expect(att.text).toContain('Total: *0*');
    expect(att.actions).toBeUndefined();
  });

  it('posts Discord embeds', async () => {
    expect(await NotificationManager.sendDiscord(server.url, failed)).toBe(true);
    const [embed] = requests[0]!.body.embeds;
    expect(embed.color).toBe(15158332);
    expect(embed.title).toBe('[FAILED] TestFly Run: Regression');
    expect(embed.url).toBe('https://ci.example/report');
    expect(embed.fields.map((f: { name: string }) => f.name)).toEqual(['Status', 'Duration', 'Results']);
    expect(embed.fields[2].value).toBe('Total: 10 | Passed: 7 | Failed: 3');
    await NotificationManager.sendDiscord(server.url, passed);
    expect(requests[1]!.body.embeds[0].color).toBe(3066993);
  });

  it('posts MS Teams message cards', async () => {
    expect(await NotificationManager.sendTeams(server.url, failed)).toBe(true);
    const card = requests[0]!.body;
    expect(card['@type']).toBe('MessageCard');
    expect(card.themeColor).toBe('FF0000');
    expect(card.sections[0].facts).toEqual([
      { name: 'Total tests', value: '10' },
      { name: 'Passed', value: '7' },
      { name: 'Failed', value: '3' },
    ]);
    expect(card.sections[0].potentialAction[0].targets[0].uri).toBe('https://ci.example/report');
    await NotificationManager.sendTeams(server.url, passed);
    expect(requests[1]!.body.themeColor).toBe('00FF00');
    expect(requests[1]!.body.sections[0].potentialAction).toBeUndefined();
  });

  it('returns false for HTTP errors and unreachable hosts (never throws)', async () => {
    status = 500;
    expect(await NotificationManager.sendSlack(server.url, failed)).toBe(false);
    expect(await NotificationManager.sendSlack('http://127.0.0.1:1/unreachable', failed)).toBe(false);
  });
});
