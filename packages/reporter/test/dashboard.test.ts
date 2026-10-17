import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type ConsoleMessage, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDashboardModel, generateDashboard } from '../src/dashboard';
import { mergeRuns } from '../src/merge';
import type { RunRecord } from '../src/schema';
import { heal, makeRun, makeTest } from './helpers/records';
import { useTmpDirs } from './helpers/tmp';

const tmp = useTmpDirs();
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
});
afterAll(async () => { await browser?.close(); });

const EVIL = 'boom </script><script>window.__pwned=1</script>   & <b>x</b>';

function fixtureRuns(): RunRecord[] {
  const mk = (n: number, failing: boolean) =>
    makeRun(
      [
        makeTest({ id: 'c::a.spec.ts::alpha login works', title: 'alpha login works', file: 'a.spec.ts', titlePath: ['alpha login works'], tags: ['@smoke'], durationMs: 120 }),
        makeTest({ id: 'c::a.spec.ts::Cart › beta checkout', title: 'beta checkout', file: 'a.spec.ts', titlePath: ['Cart', 'beta checkout'], status: failing ? 'failed' : 'passed', durationMs: 900,
          error: failing ? { message: EVIL, stack: 'Error: x\n at y', snippet: '> 1 | foo' } : undefined, triage: failing ? 'APPLICATION_BUG' : undefined,
          api: [{ method: 'POST', url: 'http://x.test/cart', status: 500, durationMs: 12, attempt: 1, requestBody: '{"a":1}', responseBody: EVIL }],
          steps: [{ title: 'open cart', level: 'info', offsetMs: 3 }],
        }),
        makeTest({ id: 'c::b.spec.ts::gamma flaky', title: 'gamma flaky', file: 'b.spec.ts', titlePath: ['gamma flaky'], flaky: n % 2 === 0, retries: 1, heals: [heal({ key: 'k' + n }) as never] }),
        makeTest({ id: 'c::b.spec.ts::delta quarantined', title: 'delta quarantined', file: 'b.spec.ts', titlePath: ['delta quarantined'], quarantined: true, quarantineReason: 'JIRA-1', status: 'failed' }),
        makeTest({ id: 'c::b.spec.ts::epsilon skipped', title: 'epsilon skipped', file: 'b.spec.ts', titlePath: ['epsilon skipped'], status: 'skipped' }),
      ],
      { startedAt: 1_700_000_000_000 + n * 86_400_000, runId: `run-${n}`, status: failing ? 'failed' : 'passed', ci: { provider: 'github-actions', branch: 'main' } },
    );
  return [mk(1, false), mk(2, true), mk(3, true)];
}

async function open(file: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  await page.goto('file://' + file);
  return { page, errors };
}

function gen(records: RunRecord[]): string {
  const dir = join(tmp(), 'out', 'report');
  const file = join(dir, 'index.html');
  generateDashboard(records, file);
  return file;
}

describe('dashboard model', () => {
  it('requires at least one record', () => {
    expect(() => buildDashboardModel([], '/x/report/index.html')).toThrowError(/^\[TF_DASHBOARD_EMPTY\]/);
  });

  it('latest = last record; history has one point per run; heals are aggregated', () => {
    const m = buildDashboardModel(fixtureRuns(), '/x/report/index.html');
    expect(m.latest.runId).toBe('run-3');
    expect(m.history.map((h) => h.runId)).toEqual(['run-1', 'run-2', 'run-3']);
    expect(m.history[0]).toMatchObject({ branch: 'main', passRate: expect.any(Number) });
    expect(m.heals.length).toBe(3);
  });

  it('truncates huge error and api bodies', () => {
    const big = 'x'.repeat(20_000);
    const run = makeRun([makeTest({ status: 'failed', error: { message: big, stack: big }, api: [{ method: 'GET', url: 'u', status: 200, durationMs: 1, attempt: 1, responseBody: big }] })]);
    const m = buildDashboardModel([run], '/x/report/index.html');
    const t = m.latest.tests[0]!;
    expect(t.error!.message.length).toBeLessThan(7000);
    expect(t.error!.message).toContain('[truncated');
    expect(t.api[0]!.responseBody!.length).toBeLessThan(5000);
  });

  it('resolves artifact hrefs relative to the report dir (relative paths are outputDir-relative)', () => {
    const run = makeRun([makeTest({ artifacts: [{ name: 's', path: 'shots/a b.png', contentType: 'image/png' }] })]);
    const m = buildDashboardModel([run], '/o/report/index.html');
    expect((m.latest.tests[0]!.artifacts[0] as { href: string }).href).toBe('../shots/a%20b.png');
  });
});

describe('dashboard in real Chromium', () => {
  it('loads with no console errors, no failed requests and no injected script execution', async () => {
    const { page, errors } = await open(gen(fixtureRuns()));
    await page.waitForSelector('#view-overview *');
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await page.title()).toBe('TestFly Report');
    await page.close();
  });

  it('overview renders run totals from the latest run', async () => {
    const { page } = await open(gen(fixtureRuns()));
    const text = await page.locator('#view-overview').innerText();
    expect(text).toContain('66.7%');
    expect(await page.locator('#view-overview svg[aria-label^="Pass rate"]').count()).toBe(1);
    expect(text).toMatch(/github-actions/);
    await page.close();
  });

  it('tabs switch: exactly one view visible, aria-selected and URL hash follow', async () => {
    const { page, errors } = await open(gen(fixtureRuns()));
    for (const tab of ['tests', 'radar', 'history', 'heals', 'overview']) {
      await page.click(`[data-tab="${tab}"]`);
      for (const other of ['overview', 'tests', 'radar', 'history', 'heals']) {
        expect(await page.locator(`#view-${other}`).isVisible(), `${other} visible while on ${tab}`).toBe(other === tab);
      }
      expect(await page.getAttribute(`[data-tab="${tab}"]`, 'aria-selected')).toBe('true');
      expect(new URL(page.url()).hash).toBe(`#${tab}`);
      expect((await page.locator(`#view-${tab}`).innerText()).trim().length).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
    await page.close();
  });

  it('search filter narrows the test list and shows an empty state', async () => {
    const { page, errors } = await open(gen(fixtureRuns()));
    await page.click('[data-tab="tests"]');
    const rows = page.locator('#view-tests .row');
    expect(await rows.count()).toBe(5);
    await page.fill('#view-tests input[type="search"]', 'BETA');
    expect(await rows.count()).toBe(1);
    expect(await rows.first().innerText()).toContain('beta checkout');
    await page.fill('#view-tests input[type="search"]', '@smoke');
    expect(await rows.count()).toBe(1);
    expect(await rows.first().innerText()).toContain('alpha');
    await page.fill('#view-tests input[type="search"]', 'b.spec');
    expect(await rows.count()).toBe(3);
    await page.fill('#view-tests input[type="search"]', 'zzz-nothing');
    expect(await rows.count()).toBe(0);
    expect(await page.locator('#view-tests').innerText()).toContain('No tests match');
    await page.fill('#view-tests input[type="search"]', '');
    expect(await rows.count()).toBe(5);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('status select and flaky/healed/quarantined checkboxes filter', async () => {
    const { page } = await open(gen(fixtureRuns()));
    await page.click('[data-tab="tests"]');
    const rows = page.locator('#view-tests .row');
    await page.selectOption('#view-tests select', 'failed');
    expect(await rows.count()).toBe(1); // quarantined failures are not "failed"
    await page.selectOption('#view-tests select', 'quarantined');
    expect(await rows.count()).toBe(1);
    await page.selectOption('#view-tests select', 'skipped');
    expect(await rows.count()).toBe(1);
    await page.selectOption('#view-tests select', 'all');
    await page.getByLabel('healed').check();
    expect(await rows.count()).toBe(1);
    await page.getByLabel('healed').uncheck();
    await page.getByLabel('quarantined', { exact: true }).check();
    expect(await rows.count()).toBe(1);
    await page.close();
  });

  it('expanding a failing test shows its error as text (escaped, not executed)', async () => {
    const { page, errors } = await open(gen(fixtureRuns()));
    await page.click('[data-tab="tests"]');
    await page.fill('#view-tests input[type="search"]', 'beta');
    await page.locator('#view-tests .row .head').first().click();
    expect(await page.locator('#view-tests .row .head').first().getAttribute('aria-expanded')).toBe('true');
    const text = await page.locator('#view-tests .row').first().innerText();
    expect(text).toContain('</script><script>window.__pwned=1</script>');
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await page.locator('#view-tests .row b').count()).toBe(0);
    await page.locator('#view-tests .row .head').first().click();
    expect(await page.locator('#view-tests .row .head').first().getAttribute('aria-expanded')).toBe('false');
    expect(errors).toEqual([]);
    await page.close();
  });

  it('dark/light toggle flips data-theme and persists in localStorage', async () => {
    const { page, errors } = await open(gen(fixtureRuns()));
    await page.emulateMedia({ colorScheme: 'light' });
    const get = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(await get()).toBeNull();
    const bg0 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('#theme');
    expect(await get()).toBe('dark');
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg1).not.toBe(bg0);
    expect(await page.evaluate(() => localStorage.getItem('tf-theme'))).toBe('dark');
    await page.click('#theme');
    expect(await get()).toBe('light');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bg0);
    await page.reload();
    expect(await get()).toBe('light'); // remembered
    expect(errors).toEqual([]);
    await page.close();
  });

  it('with OS dark preference the first toggle goes to light', async () => {
    const { page } = await open(gen(fixtureRuns()));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.click('#theme');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light');
    await page.close();
  });

  it('radar, history and heals tabs list data from the model', async () => {
    const { page } = await open(gen(fixtureRuns()));
    await page.click('[data-tab="radar"]');
    expect(await page.locator('#view-radar').innerText()).toContain('beta checkout');
    await page.click('[data-tab="history"]');
    const hist = await page.locator('#view-history').innerText();
    expect(hist).toContain('main');
    await page.click('[data-tab="heals"]');
    expect(await page.locator('#view-heals').innerText()).toContain('k1');
    await page.close();
  });

  it('deep-links to a tab via the URL hash; unknown hashes fall back to overview', async () => {
    const file = gen(fixtureRuns());
    const page = await browser.newPage();
    await page.goto('file://' + file + '#history');
    expect(await page.locator('#view-history').isVisible()).toBe(true);
    expect(await page.locator('#view-overview').isVisible()).toBe(false);
    await page.goto('about:blank');
    await page.goto('file://' + file + '#bogus');
    expect(await page.locator('#view-overview').isVisible()).toBe(true);
    await page.close();
  });

  it('works with a single run and with an all-green run (empty states, no errors)', async () => {
    const green = makeRun([makeTest({ id: 'only', title: 'only' })]);
    const { page, errors } = await open(gen([green]));
    for (const tab of ['tests', 'radar', 'history', 'heals', 'overview']) {
      await page.click(`[data-tab="${tab}"]`);
      expect((await page.locator(`#view-${tab}`).innerText()).trim().length).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
    await page.close();
  });

  it('works for a merged shard run and an empty-tests run', async () => {
    const shards = fixtureRuns().slice(1).map((r, i) => ({ ...r, shard: { current: i + 1, total: 2 } }));
    const merged = mergeRuns(shards);
    const { page, errors } = await open(gen([merged]));
    await page.click('[data-tab="tests"]');
    expect(await page.locator('#view-tests .row').count()).toBe(5);
    const { page: p2, errors: e2 } = await open(gen([makeRun([])]));
    await p2.click('[data-tab="tests"]');
    expect(await p2.locator('#view-tests').innerText()).toContain('No tests match');
    expect(errors).toEqual([]);
    expect(e2).toEqual([]);
    await page.close();
    await p2.close();
  });

  it('handles 1000 tests (pagination cap) without errors', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => makeTest({ id: `t${i}`, title: `test ${i}`, file: `f${i % 10}.spec.ts` }));
    const { page, errors } = await open(gen([makeRun(many)]));
    await page.click('[data-tab="tests"]');
    expect(await page.locator('#view-tests .row').count()).toBe(200);
    await page.getByRole('button', { name: /Show more/ }).click();
    expect(await page.locator('#view-tests .row').count()).toBe(400);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('generateDashboard creates missing parent directories and writes a standalone file', () => {
    const base = tmp();
    const file = join(base, 'deep', 'er', 'index.html');
    generateDashboard(fixtureRuns(), file);
    expect(readFileSync(file, 'utf8').startsWith('<!doctype html>')).toBe(true);
    mkdirSync(join(base, 'x'));
    writeFileSync(join(base, 'x', 'keep'), '');
  });
});
