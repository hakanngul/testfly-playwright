/** Options of {@link firstJsonDifference}. @public */
export interface JsonEqualityOptions {
  /** Treat arrays as multisets: same elements in any order. Default false. */
  ignoreArrayOrder?: boolean;
}

/**
 * Semantic JSON comparison used by `ApiResponse.expectJsonEquals`: object key order never matters,
 * array order matters unless `ignoreArrayOrder` is set. Returns a description of the first difference
 * (with its JSON path) or `null` when the values are equal.
 *
 * @internal
 */
export function firstJsonDifference(actual: unknown, expected: unknown, options: JsonEqualityOptions = {}, path = '$'): string | null {
  if (Object.is(actual, expected)) return null;
  const ta = kind(actual);
  const te = kind(expected);
  if (ta !== te) return `${path}: expected ${te} ${show(expected)} but got ${ta} ${show(actual)}`;

  if (ta === 'array') {
    const a = actual as unknown[];
    const e = expected as unknown[];
    if (a.length !== e.length) return `${path}: expected ${e.length} element(s) but got ${a.length}`;
    if (options.ignoreArrayOrder) {
      const remaining = [...a];
      for (let i = 0; i < e.length; i++) {
        const idx = remaining.findIndex((item) => firstJsonDifference(item, e[i], options) === null);
        if (idx === -1) return `${path}: no element equal to expected ${path}[${i}] = ${show(e[i])}`;
        remaining.splice(idx, 1);
      }
      return null;
    }
    for (let i = 0; i < e.length; i++) {
      const diff = firstJsonDifference(a[i], e[i], options, `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }

  if (ta === 'object') {
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    for (const key of Object.keys(e)) {
      if (!(key in a)) return `${childPath(path, key)}: missing (expected ${show(e[key])})`;
      const diff = firstJsonDifference(a[key], e[key], options, childPath(path, key));
      if (diff) return diff;
    }
    for (const key of Object.keys(a)) {
      if (!(key in e)) return `${childPath(path, key)}: unexpected key (value ${show(a[key])})`;
    }
    return null;
  }

  return `${path}: expected ${show(expected)} but got ${show(actual)}`;
}

function kind(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function childPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}['${key.replace(/'/g, "\\'")}']`;
}

function show(v: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(v) ?? String(v);
  } catch {
    s = String(v);
  }
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}
