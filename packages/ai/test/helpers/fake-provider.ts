import type { LlmProvider, LlmRequest, LlmResponse } from '../../src/providers';

export type Responder = (req: LlmRequest, callIndex: number) => string | Partial<LlmResponse> | Promise<string | Partial<LlmResponse>>;

/** A scriptable fake LLM that records every request. No network. */
export class FakeProvider implements LlmProvider {
  readonly name = 'fake';
  readonly requests: LlmRequest[] = [];
  inFlight = 0;
  maxInFlight = 0;
  constructor(public responder: Responder) {}

  get calls(): number {
    return this.requests.length;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const idx = this.requests.length;
    this.requests.push(JSON.parse(JSON.stringify(req)));
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      const r = await this.responder(req, idx);
      const res = typeof r === 'string' ? { text: r } : r;
      return { text: '', model: 'fake-model', inputTokens: 10, outputTokens: 5, ...res };
    } finally {
      this.inFlight--;
    }
  }

  allText(): string {
    return this.requests.map((r) => `${r.system}\n${r.messages.map((m) => m.content).join('\n')}`).join('\n----\n');
  }
}

export const plan = (steps: unknown[]): string => JSON.stringify({ steps });
