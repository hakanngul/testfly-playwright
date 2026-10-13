import { TestFlyError } from '@testfly/playwright';
import type { AiOptions } from '@testfly/playwright';
import type { LlmProvider } from './types';
import { anthropicProvider } from './anthropic';
import { openAiProvider } from './openai';
import { geminiProvider } from './gemini';

export type { LlmProvider, LlmRequest, LlmResponse, LlmMessage } from './types';

/** Factory signature for custom providers. @public */
export type ProviderFactory = (options: AiOptions) => LlmProvider;

/** Default model per provider (`openai-compatible` has none and requires `model`). @public */
export const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-2.5-flash',
} as const;

const ENV_KEYS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY', 'TESTFLY_AI_API_KEY'],
  openai: ['OPENAI_API_KEY', 'TESTFLY_AI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'TESTFLY_AI_API_KEY'],
  'openai-compatible': ['TESTFLY_AI_API_KEY', 'OPENAI_API_KEY'],
};

function resolveKey(provider: string, options: AiOptions): string | undefined {
  if (options.apiKey) return options.apiKey;
  for (const name of ENV_KEYS[provider] ?? ['TESTFLY_AI_API_KEY']) {
    const v = process.env[name];
    if (v) return v;
  }
  return undefined;
}

function requireKey(provider: string, options: AiOptions): string {
  const key = resolveKey(provider, options);
  if (!key) {
    throw new TestFlyError('TF_AI_NOT_CONFIGURED', `No API key for AI provider "${provider}".`, {
      hint: `Set ${(ENV_KEYS[provider] ?? ['TESTFLY_AI_API_KEY'])[0]} (or testfly.ai.apiKey), or use ai.mode="replay" with committed caches.`,
    });
  }
  return key;
}

const registry = new Map<string, ProviderFactory>([
  ['anthropic', (o) => anthropicProvider({ apiKey: requireKey('anthropic', o), model: o.model ?? DEFAULT_MODELS.anthropic, baseUrl: o.baseUrl, timeoutMs: o.timeoutMs })],
  ['openai', (o) => openAiProvider({ apiKey: requireKey('openai', o), model: o.model ?? DEFAULT_MODELS.openai, baseUrl: o.baseUrl, timeoutMs: o.timeoutMs, compatible: false })],
  ['gemini', (o) => geminiProvider({ apiKey: requireKey('gemini', o), model: o.model ?? DEFAULT_MODELS.gemini, baseUrl: o.baseUrl, timeoutMs: o.timeoutMs })],
  [
    'openai-compatible',
    (o) => {
      if (!o.baseUrl) throw new TestFlyError('TF_AI_NOT_CONFIGURED', 'Provider "openai-compatible" requires testfly.ai.baseUrl.', { hint: 'e.g. baseUrl: "http://localhost:11434/v1" for Ollama.' });
      if (!o.model) throw new TestFlyError('TF_AI_NOT_CONFIGURED', 'Provider "openai-compatible" requires testfly.ai.model.');
      // Local servers (Ollama…) often need no key.
      return openAiProvider({ apiKey: resolveKey('openai-compatible', o), model: o.model, baseUrl: o.baseUrl, timeoutMs: o.timeoutMs, compatible: true });
    },
  ],
]);

/**
 * Register (or override) a provider factory, e.g. for an in-house gateway.
 * The name can then be used as `testfly.ai.provider` when set programmatically.
 *
 * @public
 */
export function registerProvider(name: string, factory: ProviderFactory): void {
  registry.set(name, factory);
}

/**
 * Create the LLM provider for the given options. Throws `TF_AI_NOT_CONFIGURED` when
 * credentials/model are missing — never returns a fake provider.
 *
 * @public
 */
export function createProvider(options: AiOptions): LlmProvider {
  const factory = registry.get(options.provider);
  if (!factory) {
    throw new TestFlyError('TF_AI_NOT_CONFIGURED', `Unknown AI provider "${options.provider}".`, {
      hint: `Known providers: ${[...registry.keys()].join(', ')}. Use registerProvider() to add one.`,
    });
  }
  return factory(options);
}
