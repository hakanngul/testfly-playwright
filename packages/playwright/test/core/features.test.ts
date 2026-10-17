import { describe, expect, it } from 'vitest';
import { defineConfig } from '../../src/core/config';
import { parseTestFlyOptions } from '../../src/core/config/parse';

type Resolved = ReturnType<typeof parseTestFlyOptions>;
const reporterOf = (config: ReturnType<typeof defineConfig>) =>
  (Array.isArray(config.reporter) ? config.reporter : []).find((r) => String(r[0]).includes('reporter')) as [string, Record<string, unknown>] | undefined;

describe('features kill-switch panel', () => {
  it('everything is on by default and leaves the feature options untouched', () => {
    const o = parseTestFlyOptions({ healing: { mode: 'ai' }, consoleErrors: { mode: 'fail' } });
    expect(o.features).toEqual({ healing: true, ai: true, quarantine: true, consoleErrors: true, reporter: true, notifications: true });
    expect(o.healing.mode).toBe('ai');
    expect(o.consoleErrors.mode).toBe('fail');
  });

  it('a disabled feature wins over its own options', () => {
    const o: Resolved = parseTestFlyOptions({
      healing: { mode: 'ai' },
      ai: { mode: 'live' },
      consoleErrors: { mode: 'fail' },
      reporter: { notifications: { slack: 'https://hooks.example/x' } },
      features: { healing: false, ai: false, consoleErrors: false, notifications: false },
    });
    expect(o.healing.mode).toBe('off');
    expect(o.ai.mode).toBe('off');
    expect(o.consoleErrors.mode).toBe('off');
    expect(o.reporter.notifications).toBeUndefined();
    expect(o.reporter.enabled).toBe(true);
  });

  it('features.reporter=false drops @testfly/reporter from the config', () => {
    expect(reporterOf(defineConfig({ testfly: { features: { reporter: false } } }))).toBeUndefined();
  });

  it('notifications reach the reporter options unless switched off', () => {
    const on = reporterOf(defineConfig({ testfly: { reporter: { notifications: { teams: 'https://t', on: 'always' } } } }));
    expect(on?.[1].notifications).toEqual({ teams: 'https://t', on: 'always' });
    const off = reporterOf(defineConfig({ testfly: { reporter: { notifications: { teams: 'https://t' } }, features: { notifications: false } } }));
    expect(off?.[1].notifications).toBeUndefined();
  });

  it('a project can switch a feature off for itself only', () => {
    const config = defineConfig({
      testfly: { reporter: { enabled: false } },
      projects: [{ name: 'a' }, { name: 'b', use: { testfly: { features: { healing: false } } } }],
    });
    const modes = Object.fromEntries((config.projects ?? []).map((p) => [p.name, (p.use as unknown as { testfly: Resolved }).testfly.healing.mode]));
    expect(modes).toEqual({ a: 'rules', b: 'off' });
  });
});
