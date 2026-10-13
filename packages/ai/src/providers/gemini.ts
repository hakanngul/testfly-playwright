import type { LlmProvider, LlmRequest, LlmResponse } from './types';
import type { ProviderConfig } from './anthropic';
import { postJson, providerError, trimUrl } from './http';

/** Gemini generateContent (plain fetch). The key travels in a header, never in the URL. @internal */
export function geminiProvider(cfg: ProviderConfig): LlmProvider {
  return {
    name: 'gemini',
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const data = (await postJson({
        provider: 'gemini',
        url: `${trimUrl(cfg.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta')}/models/${encodeURIComponent(cfg.model)}:generateContent`,
        headers: { 'x-goog-api-key': cfg.apiKey ?? '' },
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: {
            maxOutputTokens: req.maxTokens,
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            ...(req.json ? { responseMimeType: 'application/json' } : {}),
          },
        },
        timeoutMs: cfg.timeoutMs,
        signal: req.signal,
        secrets: [cfg.apiKey ?? ''],
      })) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        modelVersion?: string;
      };
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      if (!text) throw providerError('gemini', 'response contained no text (blocked or empty candidate)');
      return {
        text,
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
        model: data.modelVersion ?? cfg.model,
      };
    },
  };
}
