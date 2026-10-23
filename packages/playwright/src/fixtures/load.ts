import fs from 'node:fs';
import path from 'node:path';
import { TestFlyError } from '../core/errors';
import { buildScript, runK6, type LoadRequest, type LoadResult, type LoadRunOptions } from '../core/load/k6';
import { coreTest } from './core';

/** The `load` fixture. @public */
export interface LoadApi {
  /**
   * Runs a k6 load test and returns its summary. Without `script`, a k6 script is generated from
   * `url`/`requests`, `vus`, `duration`/`iterations` and `thresholds`. The summary is attached to the
   * test as `k6-summary`; call `result.assertPassed()` to fail the test on crossed thresholds.
   */
  run(options: LoadRunOptions): Promise<LoadResult>;
}

/** Test-scoped fixtures of {@link loadTest}. @public */
export interface LoadFixtures {
  load: LoadApi;
}

function resolveUrl(url: string, base: string | undefined): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (!base) {
    throw new TestFlyError('TF_CONFIG_MISSING', `load.run() got the relative URL "${url}" but no base URL is configured.`, {
      hint: 'Pass baseUrl, an absolute url, or set testfly.api.baseUrl / testfly.baseUrl / use.baseURL.',
    });
  }
  return new URL(url, base.endsWith('/') ? base : `${base}/`).toString();
}

/**
 * k6 load tests from Playwright tests (TestFly's declarative load testing). k6 is a separate binary the
 * user installs; nothing is bundled.
 *
 * @public
 */
export const loadTest = coreTest.extend<LoadFixtures>({
  load: async ({ testfly, baseURL }, use, testInfo) => {
    let runs = 0;
    await use({
      async run(options) {
        runs++;
        const dir = testInfo.outputPath(`load-${runs}`);
        fs.mkdirSync(dir, { recursive: true });
        let scriptPath: string;
        if (options.script) {
          scriptPath = path.resolve(options.script);
          if (!fs.existsSync(scriptPath)) {
            throw new TestFlyError('TF_CONFIG_INVALID', `k6 script not found: ${scriptPath}`);
          }
        } else {
          const base = options.baseUrl ?? testfly.api.baseUrl ?? testfly.baseUrl ?? baseURL;
          const requests: LoadRequest[] = (options.requests ?? (options.url ? [{ url: options.url, method: options.method, headers: options.headers, body: options.body }] : [])).map(
            (r) => ({ ...r, url: resolveUrl(r.url, base) }),
          );
          if (requests.length === 0) {
            throw new TestFlyError('TF_CONFIG_INVALID', 'load.run() needs url, requests or script.');
          }
          scriptPath = path.join(dir, 'load.js');
          fs.writeFileSync(scriptPath, buildScript({ ...options, requests }));
        }
        const result = await runK6(testfly.load.k6Path, scriptPath, options.env ?? {}, testfly.load.timeoutMs);
        await testInfo.attach('k6-summary', { body: JSON.stringify(result.raw, null, 2), contentType: 'application/json' });
        return result;
      },
    });
  },
});
