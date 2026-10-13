/** A single chat message sent to an LLM. @public */
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Provider-neutral completion request. @public */
export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens: number;
  temperature?: number;
  /** Ask the provider for a JSON-only answer (best effort, provider dependent). */
  json?: boolean;
  signal?: AbortSignal;
}

/** Provider-neutral completion response. @public */
export interface LlmResponse {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  model: string;
}

/**
 * Minimal LLM provider contract. Implementations use plain `fetch` (no vendor SDKs).
 *
 * @public
 */
export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
