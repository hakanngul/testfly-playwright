/** Mutable request draft handed to auth strategies before it is sent. @public */
export interface PreparedRequest {
  method: string;
  /** Full URL; strategies may add query parameters. */
  url: URL;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  /** Serialized body when known (string/Buffer); undefined for GET or multipart. */
  body?: string | Buffer;
}

/**
 * Authentication strategy applied to every request of an `ApiClient`.
 * @public
 */
export interface AuthStrategy {
  readonly name: string;
  /** Decorate the request (headers, query, signature). */
  apply(req: PreparedRequest): void | Promise<void>;
  /**
   * Called on a 401 response. Return true after updating `req` so the request is retried once.
   */
  handleChallenge?(req: PreparedRequest, res: { status: number; headers: Record<string, string> }): boolean | Promise<boolean>;
}
