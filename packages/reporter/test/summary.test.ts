import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { printSummary } from '../src/summary';
import { makeRun, makeTest } from './helpers/records';

const ESC = '\u001b[';
const ENV_KEYS = ['NO_COLOR', 'FORCE_COLOR', 'CI'] as const;
let savedEnv: Record<string, string | undefined>;
let savedTty: PropertyDescriptor | undefined;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  savedTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  if (savedTty) Object.defineProperty(process.stdout, 'isTTY', savedTty);
  else delete (process.stdout as { isTTY?: boolean }).isTTY;
});

function setTty(value: boolean): void {
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true, writable: true });
}

function render(): string[] {
  const lines: string[] = [];
  const record = makeRun([makeTest({ status: 'failed' })]);
  printSummary({ record, gate: { passed: false, violations: ['too low'] }, gateConfigured: true, flakiness: [], warnings: 0 }, (l) => lines.push(l));
  return lines;
}
const colored = (lines: string[]): boolean => lines.some((l) => l.includes(ESC));

describe('printSummary colour handling (NO_COLOR / FORCE_COLOR / CI / TTY)', () => {
  it('colours output on a TTY outside CI', () => {
    setTty(true);
    expect(colored(render())).toBe(true);
  });

  it('is plain when stdout is not a TTY', () => {
    setTty(false);
    expect(colored(render())).toBe(false);
  });

  it('is plain on a TTY when CI is set', () => {
    setTty(true);
    process.env.CI = 'true';
    expect(colored(render())).toBe(false);
  });

  it('NO_COLOR (non-empty) disables colours even on a TTY and with FORCE_COLOR', () => {
    setTty(true);
    process.env.NO_COLOR = '1';
    process.env.FORCE_COLOR = '1';
    expect(colored(render())).toBe(false);
  });

  it('an empty NO_COLOR is ignored', () => {
    setTty(true);
    process.env.NO_COLOR = '';
    expect(colored(render())).toBe(true);
  });

  it('FORCE_COLOR enables colours without a TTY and in CI', () => {
    setTty(false);
    process.env.CI = 'true';
    process.env.FORCE_COLOR = '1';
    expect(colored(render())).toBe(true);
  });

  it('FORCE_COLOR=0 does not force colours', () => {
    setTty(false);
    process.env.FORCE_COLOR = '0';
    expect(colored(render())).toBe(false);
  });

  it('plain output still contains the totals and gate violations', () => {
    setTty(false);
    const text = render().join('\n');
    expect(text).toContain('1 failed');
    expect(text).toContain('Quality gate: FAILED');
    expect(text).toContain('- too low');
  });
});
