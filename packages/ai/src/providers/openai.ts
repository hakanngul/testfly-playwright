import type { LlmProvider, LlmRequest, LlmResponse } from './types';
import type { ProviderConfig } from './anthropic';
import { postJson, providerError, trimUrl } from './http';

/** @internal */
export interface OpenAiConfig extends ProviderConfig {
  /** `openai-compatible` servers (Ollama, DeepSeek, Groq…) use the classic `max_tokens` field. */
  compatible: boolean;
}

/** Reasoning models reject a custom temperature. */
const FIXED_TEMPERATURE = /^(o\d|gpt-5)/i;

/** OpenAI Chat Completions, also used for OpenAI-compatible servers. @internal */
export function openAiProvider(cfg: OpenAiConfig): LlmProvider {
  const name = cfg.compatible ? 'openai-compatible' : 'openai';
  return {
    name,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const system = req.json ? `${req.system}\n\nRespond with a single JSON value only.` : req.system;
      const body: Record<string, unknown> = {
        model: cfg.model,
        messages: [{ role: 'system', content: system }, ...req.messages],
        [cfg.compatible ? 'max_tokens' : 'max_completion_tokens']: req.maxTokens,
      };
      if (req.temperature !== undefined && !FIXED_TEMPERATURE.test(cfg.model)) body.temperature = req.temperature;
      if (req.json) body.response_format = { type: 'json_object' };
      const data = (await postJson({
        provider: name,
        url: `${trimUrl(cfg.baseUrl ?? 'https://api.openai.com/v1')}/chat/completions`,
        headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {},
        body,
        timeoutMs: cfg.timeoutMs,
        signal: req.signal,
        secrets: [cfg.apiKey ?? ''],
      })) as {
        choices?: { message?: { content?: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };
      const text = data.choices?.[0]?.message?.content ?? '';
      if (!text) throw providerError(name, 'response contained no message content');
      return { text, inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens, model: data.model ?? cfg.model };
    },
  };
}
