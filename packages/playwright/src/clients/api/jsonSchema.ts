import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { importOptional, TestFlyError } from '../../core/errors';

/** A JSON Schema object or the path of a `.json` / `.yaml` file containing one. @public */
export type JsonSchemaSource = Record<string, unknown> | string;

/** An OpenAPI 3.x document or the path of a `.json` / `.yaml` file containing one. @public */
export type OpenApiSource = Record<string, unknown> | string;

/** Options of `ApiResponse.expectOpenApi`. @public */
export interface OpenApiMatchOptions {
  /** Path template in the spec, e.g. `/users/{id}`. Default: matched from the request URL. */
  path?: string;
  /** HTTP method in the spec. Default: the request method. */
  method?: string;
  /** Response key to use (`200`, `2XX`, `default`). Default: the response status, then its range, then `default`. */
  status?: string | number;
}

interface AjvLike {
  addSchema(schema: object, key: string): unknown;
  getSchema(key: string): ValidateFn | undefined;
  compile(schema: object): ValidateFn;
}
interface ValidateFn {
  (data: unknown): boolean;
  errors?: Array<{ instancePath: string; message?: string; params?: Record<string, unknown> }> | null;
}

const fileCache = new Map<string, Record<string, unknown>>();
const ajvCache = new Map<string, Promise<AjvLike>>();

/** Load a JSON/YAML document (cached by absolute path). @internal */
export function loadDocument(source: Record<string, unknown> | string, what: string): Record<string, unknown> {
  if (typeof source !== 'string') return source;
  const file = path.resolve(source);
  const cached = fileCache.get(file);
  if (cached) return cached;
  let doc: unknown;
  try {
    const text = fs.readFileSync(file, 'utf8');
    doc = /\.ya?ml$/i.test(file) ? YAML.parse(text) : JSON.parse(text);
  } catch (cause) {
    throw new TestFlyError('TF_DATA_FILE_INVALID', `Cannot read ${what} "${source}": ${(cause as Error).message}`, { cause });
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new TestFlyError('TF_DATA_FILE_INVALID', `${what} "${source}" must contain an object.`);
  }
  fileCache.set(file, doc as Record<string, unknown>);
  return doc as Record<string, unknown>;
}

/** draft 2020-12 (OpenAPI 3.1) or draft-07 (the default, also fine for OpenAPI 3.0). */
function dialectOf(schema: Record<string, unknown>): '2020' | 'default' {
  const declared = String(schema.$schema ?? '');
  if (declared.includes('2020-12') || declared.includes('2019-09')) return '2020';
  if (typeof schema.openapi === 'string' && schema.openapi.startsWith('3.1')) return '2020';
  return 'default';
}

function newAjv(dialect: '2020' | 'default'): Promise<AjvLike> {
  let pending = ajvCache.get(dialect);
  if (!pending) {
    pending = (async () => {
      const mod = await importOptional<any>(dialect === '2020' ? 'ajv/dist/2020' : 'ajv', 'JSON Schema / OpenAPI validation');
      const Ajv = mod.default ?? mod;
      // strict:false tolerates OpenAPI-only keywords (example, xml, discriminator…); `nullable` is built in.
      const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false }) as AjvLike;
      try {
        const formats = await importOptional<any>('ajv-formats', 'JSON Schema formats');
        (formats.default ?? formats)(ajv);
      } catch {
        /* ajv-formats is optional: without it `format` is not checked */
      }
      return ajv;
    })();
    ajvCache.set(dialect, pending);
  }
  return pending;
}

/** Validate `data` against a JSON Schema; returns readable issues (empty when valid). @internal */
export async function validateJsonSchema(data: unknown, source: JsonSchemaSource): Promise<string[]> {
  const schema = loadDocument(source, 'JSON Schema');
  const ajv = await newAjv(dialectOf(schema));
  const validate = ajv.compile(schema);
  return validate(data) ? [] : formatErrors(validate);
}

/**
 * Validate `data` against the response schema the OpenAPI document declares for `method path → status`.
 * Returns readable issues, or throws `TF_API_SCHEMA_MISMATCH` when the operation/response is not in the spec.
 *
 * @internal
 */
export async function validateOpenApi(
  data: unknown,
  source: OpenApiSource,
  request: { method: string; url: string; status: number; contentType: string },
  options: OpenApiMatchOptions = {},
): Promise<{ issues: string[]; operation: string }> {
  const spec = loadDocument(source, 'OpenAPI document');
  if (typeof spec.openapi !== 'string') {
    throw new TestFlyError('TF_API_SCHEMA_MISMATCH', 'The OpenAPI document has no "openapi" version field.', {
      hint: 'Pass an OpenAPI 3.x document (Swagger 2.0 is not supported).',
    });
  }
  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
  const method = (options.method ?? request.method).toLowerCase();
  const template = options.path ?? matchPath(Object.keys(paths), new URL(request.url).pathname, spec);
  const operation = template ? (paths[template]?.[method] as Record<string, unknown> | undefined) : undefined;
  const label = `${method.toUpperCase()} ${template ?? new URL(request.url).pathname}`;
  if (!template || !operation) {
    throw new TestFlyError('TF_API_SCHEMA_MISMATCH', `The OpenAPI document has no operation for ${label}.`, {
      hint: 'Pass { path: "/users/{id}", method } explicitly if the request URL does not match the spec paths.',
    });
  }
  const responses = (operation.responses ?? {}) as Record<string, Record<string, unknown>>;
  const status = String(options.status ?? request.status);
  const key = [status, `${status[0]}XX`, `${status[0]}xx`, 'default'].find((k) => responses[k]);
  if (!key) {
    throw new TestFlyError('TF_API_SCHEMA_MISMATCH', `${label} does not document a ${status} response (documented: ${Object.keys(responses).join(', ') || 'none'}).`);
  }
  const content = (responses[key]!.content ?? {}) as Record<string, { schema?: unknown }>;
  const mediaKey = pickMediaType(Object.keys(content), request.contentType);
  if (!mediaKey || !content[mediaKey]?.schema) return { issues: [], operation: `${label} → ${key}` };

  const ajv = await newAjv(dialectOf(spec));
  const docKey = typeof source === 'string' ? `openapi:${path.resolve(source)}` : `openapi:${fingerprint(spec)}`;
  if (!ajv.getSchema(docKey)) ajv.addSchema(spec, docKey);
  const pointer = ['paths', template, method, 'responses', key, 'content', mediaKey, 'schema'].map(escapePointer).join('/');
  const validate = ajv.compile({ $ref: `${docKey}#/${pointer}` });
  return { issues: validate(data) ? [] : formatErrors(validate), operation: `${label} → ${key} (${mediaKey})` };
}

/** Find the spec path template matching a concrete path (honours a server base path). */
function matchPath(templates: string[], pathname: string, spec: Record<string, unknown>): string | undefined {
  const bases = ((spec.servers as Array<{ url?: string }> | undefined) ?? [])
    .map((s) => {
      try {
        return new URL(s.url ?? '', 'http://x').pathname.replace(/\/+$/, '');
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  const candidates = [pathname, ...bases.filter((b) => pathname.startsWith(b)).map((b) => pathname.slice(b.length) || '/')];
  for (const candidate of candidates) {
    // Literal templates win over parameterised ones (`/users/me` before `/users/{id}`).
    const ordered = [...templates].sort((a, b) => (a.match(/\{/g)?.length ?? 0) - (b.match(/\{/g)?.length ?? 0));
    for (const t of ordered) {
      const re = new RegExp(`^${t.split(/\{[^}]+\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+')}/?$`);
      if (re.test(candidate)) return t;
    }
  }
  return undefined;
}

function pickMediaType(keys: string[], actual: string): string | undefined {
  if (!keys.length) return undefined;
  return keys.find((k) => k === actual) ?? keys.find((k) => k.includes('json')) ?? keys.find((k) => k === '*/*') ?? keys[0];
}

function escapePointer(segment: string): string {
  return encodeURIComponent(segment.replace(/~/g, '~0').replace(/\//g, '~1'));
}

function fingerprint(doc: Record<string, unknown>): string {
  const text = JSON.stringify(doc);
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${text.length}-${h >>> 0}`;
}

function formatErrors(validate: ValidateFn): string[] {
  return (validate.errors ?? []).slice(0, 20).map((e) => {
    const where = e.instancePath ? `$${e.instancePath.replace(/\/(\d+)(?=\/|$)/g, '[$1]').replace(/\//g, '.')}` : '$';
    const extra = e.params && 'additionalProperty' in e.params ? ` "${String(e.params.additionalProperty)}"` : e.params && 'allowedValues' in e.params ? ` ${JSON.stringify(e.params.allowedValues)}` : '';
    return `${where}: ${e.message ?? 'is invalid'}${extra}`;
  });
}
