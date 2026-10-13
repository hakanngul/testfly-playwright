import type { LlmProvider, LlmRequest, LlmResponse } from './types';
import { postJson, providerError, trimUrl } from './http';

/** @internal */
export interface ProviderConfig {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
}

/** Anthropic Messages API (plain fetch). @internal */
export function anthropicProvider(cfg: ProviderConfig): LlmProvider {
  return {
    name: 'anthropic',
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const system = req.json ? `${req.system}\n\nRespond with a single JSON value only, no prose and no code fences.` : req.system;
      const data = (await postJson({
        provider: 'anthropic',
        url: `${trimUrl(cfg.baseUrl ?? 'https://api.anthropic.com')}/v1/messages`,
        headers: { 'x-api-key': cfg.apiKey ?? '', 'anthropic-version': '2023-06-01' },
        body: {
          model: cfg.model,
          max_tokens: req.maxTokens,
          system,
          messages: req.messages,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        },
        timeoutMs: cfg.timeoutMs,
        signal: req.signal,
        secrets: [cfg.apiKey ?? ''],
      })) as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
        model?: string;
      };
      const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
      if (!text) throw providerError('anthropic', 'response contained no text content');
      return { text, inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens, model: data.model ?? cfg.model };
    },
  };
}
