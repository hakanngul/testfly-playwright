import fs from 'node:fs';
import path from 'node:path';
import { coreTest } from './core';
import { configBaseDir } from './paths';

type QuarantineModule = Pick<typeof import('@testfly/reporter'), 'loadQuarantine' | 'matchQuarantine'>;
type QuarantineList = ReturnType<QuarantineModule['loadQuarantine']>;

/** Worker-scoped quarantine list cache. @internal */
export interface QuarantineCache {
  mod: QuarantineModule;
  list: QuarantineList;
}

/**
 * Auto fixture that skips tests listed in the quarantine file (`testfly.reporter.quarantineFile`).
 * The test is annotated with `{ type: 'quarantine' }` so the reporter can count it.
 *
 * @public
 */
export const quarantineTest = coreTest.extend<{ _quarantineGuard: void }, { _quarantineCache: QuarantineCache | null }>({
  _quarantineCache: [
    async ({ testfly }, use, workerInfo) => {
      const file = path.resolve(configBaseDir(workerInfo.config), testfly.reporter.quarantineFile);
      if (!fs.existsSync(file)) {
        await use(null);
        return;
      }
      const mod = (await import('@testfly/reporter')) as QuarantineModule;
      await use({ mod, list: mod.loadQuarantine(file) });
    },
    { scope: 'worker' },
  ],

  _quarantineGuard: [
    async ({ _quarantineCache }, use, testInfo) => {
      if (_quarantineCache) {
        const match = _quarantineCache.mod.matchQuarantine(_quarantineCache.list, {
          file: path.relative(configBaseDir(testInfo.config), testInfo.file).split(path.sep).join('/'),
          titlePath: testInfo.titlePath.slice(1),
          tags: testInfo.tags,
          project: testInfo.project.name,
        });
        if (match) {
          const reason = match.reason ?? 'quarantined';
          testInfo.annotations.push({ type: 'quarantine', description: reason });
          testInfo.skip(true, `Quarantined: ${reason}`);
        }
      }
      await use();
    },
    { auto: true },
  ],
});
