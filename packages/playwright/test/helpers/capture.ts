import { vi } from 'vitest';

/** Capture console.log/warn and process.stdout.write output while `fn` runs. */
export async function capture<T>(fn: () => Promise<T> | T): Promise<{ result: T; logs: string[]; warns: string[]; stdout: string }> {
  const logs: string[] = [];
  const warns: string[] = [];
  let stdout = '';
  const l = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
  const w = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => void warns.push(a.join(' ')));
  const s = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write);
  try {
    const result = await fn();
    return { result, logs, warns, stdout };
  } finally {
    l.mockRestore();
    w.mockRestore();
    s.mockRestore();
  }
}
