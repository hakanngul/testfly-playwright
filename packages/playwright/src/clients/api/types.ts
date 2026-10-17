import type { ZodType } from 'zod';
import type { ApiOptions } from '../../core/config/schema';

/** Resolved retry policy. @public */
export type RetryPolicy = ApiOptions['retry'];

/** Per-request options. @public */
export interface ApiRequestOptions {
  /** Query-string parameters. */
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Raw body (string/Buffer are sent as-is, objects are JSON encoded). */
  data?: unknown;
  /** JSON body; sets `content-type: application/json`. */
  json?: unknown;
  /** `application/x-www-form-urlencoded` body. */
  form?: Record<string, string | number | boolean>;
  /** `multipart/form-data` body (passed to Playwright). */
  multipart?: Record<string, string | number | boolean | { name: string; mimeType: string; buffer: Buffer }>;
  /** Timeout in ms for one attempt. */
  timeout?: number;
  /** Override the client retry policy for this request. */
  retry?: Partial<RetryPolicy>;
  /** Throw `TF_API_REQUEST_FAILED` on non-2xx responses (default false). */
  failOnStatus?: boolean;
}

/** @public */
export interface GraphqlOptions extends ApiRequestOptions {
  /** GraphQL endpoint path (default `/graphql`). */
  endpoint?: string;
  operationName?: string;
}

/** Options accepted by `ApiClient.fetch`. @public */
export interface ApiFetchOptions extends ApiRequestOptions {
  method?: string;
}

/** Options for `ApiClient.pollUntil`. @public */
export interface PollOptions {
  /** Total time budget in ms (default 10000). */
  timeout?: number;
  /** Delay between attempts in ms (default 500). */
  interval?: number;
  /** Stop immediately (throw) when this returns true for a response. */
  failFastOn?: (res: import('./response').ApiResponse) => boolean;
}

/** Anything with a zod-like `safeParse`. @public */
export type SchemaLike<T> = Pick<ZodType<T>, 'safeParse'>;

/**
 * Hook into every request of a client (e.g. correlation ids, request signing, response logging).
 * `onRequest` runs after auth, right before the request is sent, and may change `method`, `url`,
 * `headers` and `body` in place. `onResponse` sees every response, including retried ones.
 *
 * @public
 */
export interface ApiInterceptor {
  name?: string;
  onRequest?(request: import('./auth').PreparedRequest): void | Promise<void>;
  onResponse?(response: import('./response').ApiResponse, request: import('./auth').PreparedRequest): void | Promise<void>;
}

/** One entry of {@link ApiClient.batch}: a request built from the client. @public */
export type ApiBatchTask<T = any> = (client: import('./ApiClient').ApiClient) => Promise<import('./response').ApiResponse<T>>;

/** Outcome of one batch entry; failures never reject the whole batch. @public */
export type ApiBatchResult<T = any> =
  | { index: number; ok: true; response: import('./response').ApiResponse<T>; error?: undefined }
  | { index: number; ok: false; response?: undefined; error: Error };

/** Options of {@link ApiClient.batch}. @public */
export interface ApiBatchOptions {
  /** Requests in flight at the same time (default 5). */
  concurrency?: number;
}
