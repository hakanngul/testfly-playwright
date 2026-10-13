import type { APIResponse } from '@playwright/test';

export interface ApiRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: unknown;
  form?: Record<string, string | number | boolean>;
  multipart?: any;
  timeout?: number;
  failOnStatusCode?: boolean;
  ignoreHTTPSErrors?: boolean;
}

export interface ApiResponse<T = any> {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  data: T;
  raw: APIResponse;
  duration: number;
  responseTimeMs: number;
  text: () => Promise<string>;
  json: <R = T>() => Promise<R>;
  body: () => Promise<Buffer>;
}

export interface ApiAuthManager {
  setToken: (token: string) => void;
  setBearerToken: (token: string) => void;
  setBasicAuth: (username: string, password: string) => void;
  setApiKey: (name: string, value: string, inHeader?: boolean) => void;
  clear: () => void;
  getToken: () => string | null;
  getHeaders: () => Record<string, string>;
}
