import type { AiOptions } from '@testfly/playwright';

/**
 * Fill defaults for a partial AI options object (mirrors `AiOptionsSchema`).
 * Used by the reporter and standalone helpers that do not go through the Playwright config.
 *
 * @public
 */
export function resolveAiOptions(input: Partial<AiOptions> = {}): AiOptions {
  const defined = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<AiOptions>;
  return {
    provider: 'anthropic',
    mode: 'live',
    cacheDir: '.testfly',
    timeoutMs: 30_000,
    maxTokens: 1_024,
    maxContextChars: 24_000,
    failureAnalysis: false,
    redact: [],
    ...defined,
  };
}
