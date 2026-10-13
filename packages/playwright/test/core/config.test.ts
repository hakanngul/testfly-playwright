import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defineConfig } from '../../src/core/config';
import { parseTestFlyOptions } from '../../src/core/config/parse';
import { collectEnvVars, parseDotenv, resolvePlaceholders } from '../../src/core/config/env';
import { deepMerge } from '../../src/core/config/merge';
import { TestFlyOptionsSchema } from '../../src/core/config/schema';
import { TestFlyError } from '../../src/core/errors';
import { cleanupTmp, makeTmp, withCwd, withEnv, writeFiles } from '../helpers/tmp';

afterEach(cleanupTmp);

function catchError(fn: () => unknown): TestFlyError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TestFlyError);
    return error as TestFlyError;
  }
  throw new Error('expected function to throw');
}

type Resolved = ReturnType<typeof parseTestFlyOptions>;
const testflyOf = (config: ReturnType<typeof defineConfig>): Resolved => (config.use as unknown as { testfly: Resolved }).testfly;

describe('schema defaults', () => {
  it('applies nested defaults with prefault', () => {
    const o = TestFlyOptionsSchema.parse({});
    expect(o.env).toBe('local');
    expect(o.timeouts).toEqual({ poll: 30_000, pollInterval: 500 });
    expect(o.api.retry).toEqual({ attempts: 0, backoffMs: 300, onStatus: [502, 503, 504], onNetworkError: true });
    expect(o.api.truncateAt).toBe(2000);
    expect(o.session).toEqual({ dir: '.testfly/sessions', maxAgeMinutes: 0 });
    expect(o.healing).toEqual({ mode: 'rules', failOnHeal: false, fuzzyThreshold: 0.75 });
    expect(o.ai.mode).toBe('live');
    expect(o.ai.cacheDir).toBe('.testfly');
    expect(o.reporter.enabled).toBe(true);
    expect(o.reporter.quarantineFile).toBe('testfly-quarantine.yml');
    expect(o.reporter.qualityGate.failOnHeal).toBe(false);
    expect(o.db).toBeUndefined();
    expect(o.custom).toEqual({});
  });

  it('keeps partially specified nested objects and fills the rest', () => {
    const o = TestFlyOptionsSchema.parse({ api: { retry: { attempts: 3 } }, db: { client: 'mock' } });
    expect(o.api.retry.attempts).toBe(3);
    expect(o.api.retry.backoffMs).toBe(300);
    expect(o.db).toEqual({ client: 'mock', pool: { max: 5 } });
  });
});

describe('parseTestFlyOptions', () => {
  it('throws TF_CONFIG_INVALID listing every issue', () => {
    const error = catchError(() => parseTestFlyOptions({ timeouts: { poll: -5 }, healing: { mode: 'sometimes' }, db: { client: 'oracle' } }));
    expect(error.code).toBe('TF_CONFIG_INVALID');
    expect(error.message).toContain('Invalid testfly options');
    expect(error.message).toContain('timeouts.poll');
    expect(error.message).toContain('healing.mode');
    expect(error.message).toContain('db.client');
    expect((error.details?.issues as string[]).length).toBeGreaterThanOrEqual(3);
    expect(error.hint).toBeTruthy();
  });

  it('rejects non-object options', () => {
    expect(catchError(() => parseTestFlyOptions('nope')).code).toBe('TF_CONFIG_INVALID');
    expect(catchError(() => parseTestFlyOptions([])).code).toBe('TF_CONFIG_INVALID');
  });

  it('uses the origin label in messages', () => {
    const error = catchError(() => parseTestFlyOptions({}, { timeouts: { poll: 0 } }, 'projects["api"].use.testfly'));
    expect(error.message).toContain('projects["api"].use.testfly');
  });

  it('deep merges project overrides over root options', () => {
    const o = parseTestFlyOptions({ api: { headers: { a: '1' }, retry: { attempts: 2 } }, baseUrl: 'http://root' }, { api: { retry: { backoffMs: 10 } }, baseUrl: 'http://proj' });
    expect(o.baseUrl).toBe('http://proj');
    expect(o.api.retry).toMatchObject({ attempts: 2, backoffMs: 10 });
    expect(o.api.headers).toEqual({ a: '1' });
  });

  it('applies the profile named by testfly.env', async () => {
    await withEnv({ TESTFLY_ENV: undefined }, () => {
      const o = parseTestFlyOptions({ env: 'staging', ai: { mode: 'live' }, profiles: { staging: { ai: { mode: 'replay' }, baseUrl: 'http://stg' }, prod: { ai: { mode: 'off' } } } });
      expect(o.env).toBe('staging');
      expect(o.ai.mode).toBe('replay');
      expect(o.baseUrl).toBe('http://stg');
      expect(o).not.toHaveProperty('profiles');
    });
  });

  it('TESTFLY_ENV beats testfly.env', async () => {
    await withEnv({ TESTFLY_ENV: 'ci' }, () => {
      const o = parseTestFlyOptions({ env: 'local', profiles: { ci: { ai: { mode: 'replay' } }, local: { ai: { mode: 'off' } } } });
      expect(o.env).toBe('ci');
      expect(o.ai.mode).toBe('replay');
    });
  });

  it('does not resolve placeholders in inactive profiles', async () => {
    await withEnv({ TESTFLY_ENV: undefined, DEFINITELY_UNSET_VAR_X: undefined }, () => {
      const o = parseTestFlyOptions({ profiles: { prod: { baseUrl: '${DEFINITELY_UNSET_VAR_X}' } } });
      expect(o.baseUrl).toBeUndefined();
    });
  });
});

describe('env placeholders', () => {
  it('resolves ${VAR} and ${VAR:-default} recursively', () => {
    const out = resolvePlaceholders({ a: '${X}/path', b: ['${Y:-fallback}', 5, null], c: { d: '${Z:-}' } }, { X: 'http://h' });
    expect(out).toEqual({ a: 'http://h/path', b: ['fallback', 5, null], c: { d: '' } });
  });

  it('prefers a defined variable over the default', () => {
    expect(resolvePlaceholders('${X:-d}', { X: 'real' })).toBe('real');
    expect(resolvePlaceholders('${X:-d}', { X: '' })).toBe('');
  });

  it('throws TF_CONFIG_INVALID naming variable and path for a missing variable', () => {
    const error = catchError(() => parseTestFlyOptions({ db: { client: 'postgres', connectionString: '${TF_TEST_MISSING_DB_URL}' } }));
    expect(error.code).toBe('TF_CONFIG_INVALID');
    expect(error.message).toContain('TF_TEST_MISSING_DB_URL');
    expect(error.message).toContain('testfly.db.connectionString');
    expect(error.details).toMatchObject({ variable: 'TF_TEST_MISSING_DB_URL' });
  });

  it('parses .env syntax', () => {
    const parsed = parseDotenv(['# comment', 'A=1', 'export B="two words"', "C='single # not comment'", 'D=value # trailing', 'E="line1\\nline2"', 'not a pair', ''].join('\n'));
    expect(parsed).toEqual({ A: '1', B: 'two words', C: 'single # not comment', D: 'value', E: 'line1\nline2' });
  });

  it('reads .env from the cwd and lets process.env win', async () => {
    const dir = makeTmp();
    writeFiles(dir, { '.env': 'TF_T_FROM_FILE=from-file\nTF_T_BOTH=file\n' });
    await withEnv({ TF_T_FROM_FILE: undefined, TF_T_BOTH: 'process' }, async () => {
      const vars = collectEnvVars(dir);
      expect(vars.TF_T_FROM_FILE).toBe('from-file');
      expect(vars.TF_T_BOTH).toBe('process');
      const o = parseTestFlyOptions({ baseUrl: '${TF_T_FROM_FILE}/app', custom: { both: '${TF_T_BOTH}' } }, undefined, 'testfly', dir);
      expect(o.baseUrl).toBe('from-file/app');
      expect(o.custom.both).toBe('process');
    });
  });
});

describe('deepMerge', () => {
  it('merges plain objects, replaces arrays and ignores undefined', () => {
    const base = { a: { b: 1, c: [1, 2] }, d: 1 };
    const out = deepMerge(base, { a: { c: [3], e: undefined }, d: undefined, f: 2 });
    expect(out).toEqual({ a: { b: 1, c: [3] }, d: 1, f: 2 });
    expect(base).toEqual({ a: { b: 1, c: [1, 2] }, d: 1 });
  });

  it('returns base when override is undefined', () => {
    const base = { a: 1 };
    expect(deepMerge(base, undefined)).toBe(base);
  });
});

describe('defineConfig', () => {
  it('injects resolved defaults as use.testfly and derives baseURL', () => {
    const config = defineConfig({ testfly: { baseUrl: 'http://localhost:3000', reporter: { enabled: false } } });
    expect(testflyOf(config).timeouts.poll).toBe(30_000);
    expect(testflyOf(config).baseUrl).toBe('http://localhost:3000');
    expect(config.use?.baseURL).toBe('http://localhost:3000');
    expect(config).not.toHaveProperty('testfly');
  });

  it('does not override an explicit use.baseURL', () => {
    const config = defineConfig({ testfly: { baseUrl: 'http://a', reporter: { enabled: false } }, use: { baseURL: 'http://explicit' } });
    expect(config.use?.baseURL).toBe('http://explicit');
  });

  it('works without any testfly key', () => {
    const config = defineConfig({ testDir: './tests' });
    expect(config.testDir).toBe('./tests');
    expect(testflyOf(config).env).toBe('local');
    expect(config.use?.baseURL).toBeUndefined();
  });

  it('throws TF_CONFIG_INVALID for invalid options', () => {
    const error = catchError(() => defineConfig({ testfly: { healing: { mode: 'bogus' as never } } }));
    expect(error.code).toBe('TF_CONFIG_INVALID');
    expect(error.message).toContain('healing.mode');
  });

  it('deep merges per-project use.testfly and derives per-project baseURL', () => {
    const config = defineConfig({
      testfly: { baseUrl: 'http://root', api: { retry: { attempts: 1 } }, reporter: { enabled: false } },
      projects: [
        { name: 'plain', use: {} },
        { name: 'other', use: { testfly: { baseUrl: 'http://other', api: { retry: { backoffMs: 5 } } } } },
        { name: 'explicit', use: { baseURL: 'http://keep', testfly: { baseUrl: 'http://ignored' } } },
      ],
    });
    const byName = Object.fromEntries((config.projects ?? []).map((p) => [p.name, p.use as unknown as { testfly: Resolved; baseURL?: string }]));
    expect(byName.plain!.testfly.baseUrl).toBe('http://root');
    expect(byName.plain!.testfly.api.retry.attempts).toBe(1);
    expect(byName.other!.testfly.baseUrl).toBe('http://other');
    expect(byName.other!.testfly.api.retry).toMatchObject({ attempts: 1, backoffMs: 5 });
    expect(byName.other!.baseURL).toBe('http://other');
    expect(byName.explicit!.baseURL).toBe('http://keep');
    expect(config.use?.baseURL).toBe('http://root');
  });

  it('reports the offending project on invalid project overrides', () => {
    const error = catchError(() => defineConfig({ testfly: { reporter: { enabled: false } }, projects: [{ name: 'broken', use: { testfly: { timeouts: { poll: -1 } } } }] }));
    expect(error.message).toContain('projects["broken"].use.testfly');
  });

  it('resolves ${VAR} placeholders from process.env and a .env file in the cwd', async () => {
    const dir = makeTmp();
    writeFiles(dir, { '.env': 'TF_T_ENVFILE_HOST=envfile.example\n' });
    await withEnv({ TF_T_ENVFILE_HOST: undefined, TF_T_PROC: 'proc.example', TF_T_NOPE: undefined }, () =>
      withCwd(dir, () => {
        const config = defineConfig({
          testfly: { baseUrl: 'https://${TF_T_ENVFILE_HOST}', api: { baseUrl: 'https://${TF_T_PROC}/${TF_T_NOPE:-v1}' }, reporter: { enabled: false } },
        });
        expect(testflyOf(config).baseUrl).toBe('https://envfile.example');
        expect(testflyOf(config).api.baseUrl).toBe('https://proc.example/v1');
      }),
    );
  });

  it('throws for a missing variable', async () => {
    await withEnv({ TF_T_NOPE2: undefined }, () => {
      const error = catchError(() => defineConfig({ testfly: { baseUrl: '${TF_T_NOPE2}', reporter: { enabled: false } } }));
      expect(error.code).toBe('TF_CONFIG_INVALID');
      expect(error.message).toContain('TF_T_NOPE2');
    });
  });

  it('applies TESTFLY_ENV profiles', async () => {
    await withEnv({ TESTFLY_ENV: 'ci' }, () => {
      const config = defineConfig({ testfly: { ai: { mode: 'live' }, profiles: { ci: { ai: { mode: 'replay' } } }, reporter: { enabled: false } } });
      expect(testflyOf(config).ai.mode).toBe('replay');
      expect(testflyOf(config).env).toBe('ci');
    });
  });

  it('sets TESTFLY_RUN_STARTED for workers', () => {
    defineConfig({ testfly: { reporter: { enabled: false } } });
    expect(Number(process.env.TESTFLY_RUN_STARTED)).toBeGreaterThan(0);
  });

  describe('reporter wiring', () => {
    it('adds @testfly/reporter with options to default reporters', () => {
      const config = defineConfig({ testfly: { env: 'dev', reporter: { historySize: 7, outputDir: '.out' } } });
      const reporters = config.reporter as Array<[string, Record<string, unknown>?]>;
      expect(reporters.slice(0, 2)).toEqual([['list'], ['html', { open: 'never' }]]);
      const entry = reporters.find(([name]) => name.includes('@testfly/reporter') || name.includes('reporter'));
      expect(entry).toBeDefined();
      expect(entry![1]).toMatchObject({ historySize: 7, outputDir: '.out', quarantineFile: 'testfly-quarantine.yml', env: 'dev' });
      expect(path.isAbsolute(entry![0])).toBe(true);
      expect(fs.existsSync(entry![0])).toBe(true);
    });

    it('keeps user reporters (string and list forms) and appends the TestFly reporter', () => {
      const fromString = defineConfig({ reporter: 'dot' }).reporter as unknown[][];
      expect(fromString[0]).toEqual(['dot']);
      expect(fromString).toHaveLength(2);
      const fromList = defineConfig({ reporter: [['line'], ['json', { outputFile: 'x.json' }]] }).reporter as unknown[][];
      expect(fromList.slice(0, 2)).toEqual([['line'], ['json', { outputFile: 'x.json' }]]);
      expect(fromList).toHaveLength(3);
    });

    it('does not add a second TestFly reporter', () => {
      const reporters = defineConfig({ reporter: [['@testfly/reporter', { custom: true }]] }).reporter as unknown[][];
      expect(reporters).toEqual([['@testfly/reporter', { custom: true }]]);
    });

    it('leaves reporters untouched when disabled', () => {
      expect(defineConfig({ testfly: { reporter: { enabled: false } } }).reporter).toBeUndefined();
      expect(defineConfig({ reporter: 'dot', testfly: { reporter: { enabled: false } } }).reporter).toBe('dot');
    });
  });

  describe('bdd', () => {
    it('sets testDir through defineBddConfig', async () => {
      const dir = makeTmp();
      writeFiles(dir, {
        'features/a.feature': 'Feature: A\n  Scenario: one\n    Given a step\n',
        'steps/a.steps.ts': "import { Given } from '@testfly/playwright/bdd';\nGiven('a step', async () => {});\n",
      });
      await withCwd(dir, () => {
        const config = defineConfig({
          testfly: { bdd: { features: 'features/**/*.feature', steps: 'steps/**/*.ts', outputDir: '.gen' }, reporter: { enabled: false } },
        });
        expect(config.testDir).toBeTruthy();
        expect(String(config.testDir)).toContain('.gen');
      });
    });

    it('keeps an explicit testDir', async () => {
      const dir = makeTmp();
      writeFiles(dir, { 'features/a.feature': 'Feature: A\n  Scenario: one\n    Given a step\n', 'steps/a.steps.ts': '' });
      await withCwd(dir, () => {
        const config = defineConfig({ testDir: './mine', testfly: { bdd: {}, reporter: { enabled: false } } });
        expect(config.testDir).toBe('./mine');
      });
    });
  });
});
