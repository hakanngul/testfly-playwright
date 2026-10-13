import { test as pwTest } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import { TestFlyError } from '@testfly/playwright';
import type { AiOptions } from '@testfly/playwright';
import { CONTENT_TYPES, toAttachment } from '@testfly/reporter/schema';
import type { AiEvent } from '@testfly/reporter/schema';
import { z } from 'zod';
import { CacheStores } from './cache/stores';
import { redact } from './context/redact';
import { createProvider } from './providers';
import type { LlmProvider, LlmRequest, LlmResponse } from './providers';

/** Token/provider usage accumulated over one feature call. @internal */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  provider?: string;
  model?: string;
  calls: number;
}

/** @internal */
export const newUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, calls: 0 });

/** Best-effort access to the running test's info (undefined outside a test). @internal */
export function currentTestInfo(): TestInfo | undefined {
  try {
    return pwTest.info();
  } catch {
    return undefined;
  }
}

/** Pull the first JSON value out of a model answer (tolerates code fences / prose). @internal */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[{[]/);
    const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (start === -1 || end <= start) throw new Error('no JSON value found in the response');
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

/**
 * Shared per-test runtime: mode guards, lazy provider, redaction, caches and AiEvent attachment.
 * Nothing here is global — one instance per test (or per standalone helper).
 *
 * @internal
 */
export class AiRuntime {
  readonly caches: CacheStores;
  private provider?: LlmProvider;

  constructor(
    readonly options: AiOptions,
    readonly rootDir: string = process.cwd(),
    private readonly testInfo?: TestInfo,
    /** Injected provider (tests / custom wiring). */
    provider?: LlmProvider,
  ) {
    this.provider = provider;
    this.caches = new CacheStores(rootDir, options.cacheDir);
  }

  /** `off` → TF_FEATURE_DISABLED. Cheap; call at the start of every public feature. */
  assertEnabled(feature: string): void {
    if (this.options.mode === 'off') {
      throw new TestFlyError('TF_FEATURE_DISABLED', `AI feature "${feature}" is disabled (ai.mode = "off").`, {
        hint: 'Set testfly.ai.mode to "live" (or "replay" to use committed caches) to enable it.',
      });
    }
  }

  get live(): boolean {
    return this.options.mode === 'live';
  }

  /** Throws TF_AI_CACHE_MISS in replay mode: nothing may touch the network. */
  cacheMiss(what: string, hint?: string, cause?: unknown): TestFlyError {
    return new TestFlyError('TF_AI_CACHE_MISS', `${what} is not in the AI cache and ai.mode is "replay".`, {
      hint: hint ?? 'Run once with ai.mode="live" and commit the updated .testfly/*.json files.',
      cause,
    });
  }

  /** Send a (redacted) completion request, accumulating usage. */
  async complete(req: LlmRequest, usage?: Usage): Promise<LlmResponse> {
    if (!this.live) throw this.cacheMiss('An LLM call');
    this.provider ??= createProvider(this.options);
    const r = (s: string): string => redact(s, this.options.redact);
    const res = await this.provider.complete({
      ...req,
      system: r(req.system),
      messages: req.messages.map((m) => ({ ...m, content: r(m.content) })),
    });
    if (usage) {
      usage.calls++;
      usage.inputTokens += res.inputTokens ?? 0;
      usage.outputTokens += res.outputTokens ?? 0;
      usage.provider = this.provider.name;
      usage.model = res.model;
    }
    return res;
  }

  /**
   * Ask for JSON and validate with zod. One retry with the validation error appended,
   * then TF_AI_INVALID_RESPONSE.
   */
  async completeJson<S extends z.ZodType>(args: { system: string; user: string; schema: S; usage?: Usage; maxTokens?: number }): Promise<z.output<S>> {
    const base: LlmRequest = { system: args.system, messages: [{ role: 'user', content: args.user }], maxTokens: args.maxTokens ?? this.options.maxTokens, temperature: 0, json: true };
    let req = base;
    let lastProblem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.complete(req, args.usage);
      try {
        const parsed = args.schema.safeParse(extractJson(res.text));
        if (parsed.success) return parsed.data;
        lastProblem = z.prettifyError(parsed.error);
      } catch (err) {
        lastProblem = `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
      }
      req = {
        ...base,
        messages: [
          ...base.messages,
          { role: 'assistant', content: res.text },
          { role: 'user', content: `Your previous answer was invalid:\n${lastProblem}\nReturn corrected JSON only.` },
        ],
      };
    }
    throw new TestFlyError('TF_AI_INVALID_RESPONSE', 'The model did not return valid JSON for the expected schema (after 1 retry).', {
      hint: 'Try a stronger model via testfly.ai.model.',
      details: { problem: lastProblem.slice(0, 500) },
    });
  }

  /** Attach an AiEvent (feature, cache hit/miss, tokens, duration) to the running test. */
  async attach(feature: AiEvent['feature'], goal: string, cache: AiEvent['cache'], startedAt: number, usage?: Usage): Promise<void> {
    const info = this.testInfo ?? currentTestInfo();
    if (!info) return;
    const event: AiEvent = {
      feature,
      goal,
      cache,
      provider: usage?.provider,
      model: usage?.model,
      inputTokens: usage && usage.calls ? usage.inputTokens : undefined,
      outputTokens: usage && usage.calls ? usage.outputTokens : undefined,
      durationMs: Date.now() - startedAt,
    };
    try {
      await info.attach(`testfly-ai-${feature}`, toAttachment(CONTENT_TYPES.ai, event));
    } catch {
      /* attaching must never fail a test */
    }
  }
}
