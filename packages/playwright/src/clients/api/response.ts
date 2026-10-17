import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { TestFlyError } from '../../core/errors';
import { queryJsonPath } from './jsonPath';
import { firstJsonDifference, type JsonEqualityOptions } from './jsonDiff';
import { validateJsonSchema, validateOpenApi, type JsonSchemaSource, type OpenApiMatchOptions, type OpenApiSource } from './jsonSchema';
import { truncate } from './curl';
import type { SchemaLike } from './types';

/** @internal */
export interface ApiResponseInit {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
  durationMs: number;
  request: { method: string; url: string };
  truncateAt: number;
}

/**
 * Response of an {@link ApiClient} call. The body is read eagerly, so all accessors are synchronous.
 * Assertion helpers throw `TestFlyError` and return `this` for chaining.
 *
 * @public
 */
export class ApiResponse<T = any> {
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  /** Response headers (lower-cased names). */
  readonly headers: Record<string, string>;
  /** Parsed JSON, or the raw text when the body is not JSON. */
  readonly data: T;
  readonly durationMs: number;
  readonly request: { method: string; url: string };
  private readonly rawText: string;
  private readonly truncateAt: number;
  private readonly rawBody: Buffer;

  constructor(init: ApiResponseInit) {
    this.status = init.status;
    this.statusText = init.statusText;
    this.ok = init.status >= 200 && init.status < 300;
    this.headers = init.headers;
    this.durationMs = init.durationMs;
    this.request = init.request;
    this.truncateAt = init.truncateAt;
    this.rawBody = init.body;
    this.rawText = decode(init.body, this.charset);
    let data: unknown = this.rawText;
    if (this.rawText.length > 0) {
      try {
        data = JSON.parse(this.rawText);
      } catch {
        /* not JSON, keep text */
      }
    }
    this.data = data as T;
  }

  /** Media type of the body without parameters, e.g. `application/json` (empty when not sent). */
  get contentType(): string {
    return (this.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  }

  /** Charset from `Content-Type` (default `utf-8`); the text body is decoded with it. */
  get charset(): string {
    const m = /charset\s*=\s*"?([^";\s]+)"?/i.exec(this.headers['content-type'] ?? '');
    return (m?.[1] ?? 'utf-8').toLowerCase();
  }

  /** Write the raw body to `file` (directories are created) and return the absolute path. */
  saveTo(file: string): string {
    const target = resolve(file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, this.rawBody);
    return target;
  }

  /** Body as text. */
  text(): string {
    return this.rawText;
  }

  /** Body as bytes. */
  body(): Buffer {
    return this.rawBody;
  }

  /** Body parsed as JSON; throws `TF_API_ASSERTION_FAILED` if it is not JSON. */
  json<R = T>(): R {
    try {
      return JSON.parse(this.rawText) as R;
    } catch (cause) {
      throw this.fail('Response body is not valid JSON.', { cause });
    }
  }

  /**
   * Query the JSON body. Supports `$.a.b[0]`, `$.items[*].id`, `$['key.with.dots']`.
   * Returns a single value (or `undefined`) for plain paths and an array for wildcard paths.
   */
  jsonPath<R = unknown>(path: string): R {
    let result;
    try {
      result = queryJsonPath(this.parsedOrThrow(), path);
    } catch (cause) {
      if (cause instanceof TestFlyError) throw cause;
      throw this.fail(`Invalid JSON path "${path}": ${(cause as Error).message}`, { cause });
    }
    return (result.multi ? result.values : result.values[0]) as R;
  }

  expectStatus(...codes: number[]): this {
    if (!codes.includes(this.status)) this.failWith(`Expected status ${codes.join(' or ')} but got ${this.status}.`);
    return this;
  }

  expectOk(): this {
    if (!this.ok) this.failWith('Expected a 2xx response.');
    return this;
  }

  expectHeader(name: string, value: string | RegExp): this {
    const actual = this.headers[name.toLowerCase()];
    const matches = actual !== undefined && (typeof value === 'string' ? actual === value : value.test(actual));
    if (!matches) this.failWith(`Expected header "${name}" to match ${String(value)} but got ${actual === undefined ? 'no such header' : `"${actual}"`}.`);
    return this;
  }

  expectJson(path: string, value: unknown): this {
    const actual = this.jsonPath(path);
    if (!isDeepStrictEqual(actual, value)) {
      this.failWith(`Expected ${path} to equal ${safeStringify(value)} but got ${safeStringify(actual)}.`);
    }
    return this;
  }

  /** Status code is within `from`..`to` (inclusive), e.g. `expectStatusRange(200, 299)`. */
  expectStatusRange(from: number, to: number): this {
    if (this.status < from || this.status > to) this.failWith(`Expected status in ${from}..${to} but got ${this.status}.`);
    return this;
  }

  /**
   * Semantic JSON equality of the whole body (or of `options.path`): object key order never matters,
   * array order matters unless `ignoreArrayOrder` is set. The failure message names the first difference.
   *
   * @example
   * ```ts
   * res.expectJsonEquals({ id: 1, tags: ['b', 'a'] }, { ignoreArrayOrder: true });
   * res.expectJsonEquals({ name: 'Ada' }, { path: '$.user' });
   * ```
   */
  expectJsonEquals(expected: unknown, options: JsonEqualityOptions & { path?: string } = {}): this {
    const actual = options.path ? this.jsonPath(options.path) : this.parsedOrThrow();
    const diff = firstJsonDifference(actual, expected, options, options.path ?? '$');
    if (diff) this.failWith(`JSON body differs from the expected value.\n  first difference: ${diff}`);
    return this;
  }

  /** The array at `path` contains an element semantically equal to `value` (key order ignored). */
  expectJsonArrayContains(path: string, value: unknown, options: JsonEqualityOptions = {}): this {
    const actual = this.jsonPath<unknown>(path);
    if (!Array.isArray(actual)) this.failWith(`Expected ${path} to be an array but got ${safeStringify(actual)}.`);
    const found = (actual as unknown[]).some((item) => firstJsonDifference(item, value, options) === null);
    if (!found) this.failWith(`Expected ${path} to contain ${safeStringify(value)}.`);
    return this;
  }

  /** Validate the JSON body with a zod schema and return the parsed value. */
  expectSchema<S>(schema: SchemaLike<S>): S {
    const result = schema.safeParse(this.parsedOrThrow());
    if (!result.success) {
      const issues = (result.error?.issues ?? []).map((i) => `  - ${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('\n');
      throw new TestFlyError('TF_API_SCHEMA_MISMATCH', `Response does not match the schema.\n${issues}\n${this.describe()}`, {
        details: { method: this.request.method, url: this.request.url, status: this.status },
      });
    }
    return result.data as S;
  }

  /**
   * Validate the JSON body against a JSON Schema (object, or path to a `.json`/`.yaml` file).
   * Needs the optional package `ajv` (`ajv-formats` is used for `format` when installed).
   * Draft-07 by default; draft 2019-09/2020-12 when the schema declares it in `$schema`.
   */
  async expectJsonSchema(schema: JsonSchemaSource): Promise<this> {
    const issues = await validateJsonSchema(this.parsedOrThrow(), schema);
    if (issues.length) this.schemaMismatch('JSON Schema', issues);
    return this;
  }

  /**
   * Validate the JSON body against the response schema an OpenAPI 3.x document declares for this
   * request (operation matched from method + URL path, response from the status code, `2XX` or `default`).
   * `$ref`s to `components` are resolved. Needs the optional package `ajv`.
   *
   * @example
   * ```ts
   * await (await api.get('/users/7')).expectOpenApi('openapi.yaml');
   * ```
   */
  async expectOpenApi(spec: OpenApiSource, options: OpenApiMatchOptions = {}): Promise<this> {
    const { issues, operation } = await validateOpenApi(
      this.parsedOrThrow(),
      spec,
      { method: this.request.method, url: this.request.url, status: this.status, contentType: this.contentType },
      options,
    );
    if (issues.length) this.schemaMismatch(`OpenAPI ${operation}`, issues);
    return this;
  }

  private schemaMismatch(against: string, issues: string[]): never {
    throw new TestFlyError('TF_API_SCHEMA_MISMATCH', `Response does not match the ${against} schema.\n${issues.map((i) => `  - ${i}`).join('\n')}\n${this.describe()}`, {
      details: { method: this.request.method, url: this.request.url, status: this.status, issues },
    });
  }

  expectDurationBelow(ms: number): this {
    if (this.durationMs >= ms) this.failWith(`Expected the request to take less than ${ms}ms but it took ${this.durationMs}ms.`);
    return this;
  }

  private parsedOrThrow(): unknown {
    try {
      return JSON.parse(this.rawText);
    } catch (cause) {
      throw this.fail('Response body is not valid JSON.', { cause });
    }
  }

  private describe(): string {
    return `${this.request.method} ${this.request.url} → ${this.status}\n  body: ${truncate(this.rawText, this.truncateAt)}`;
  }

  private failWith(message: string): never {
    throw this.fail(message);
  }

  private fail(message: string, extra: { cause?: unknown } = {}): TestFlyError {
    return new TestFlyError('TF_API_ASSERTION_FAILED', `${message}\n  ${this.describe()}`, {
      cause: extra.cause,
      details: { method: this.request.method, url: this.request.url, status: this.status },
    });
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Decode with the response charset; unknown charsets fall back to UTF-8. */
function decode(body: Buffer, charset: string): string {
  if (charset === 'utf-8' || charset === 'utf8') return body.toString('utf8');
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return body.toString('utf8');
  }
}
