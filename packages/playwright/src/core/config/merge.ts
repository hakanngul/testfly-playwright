function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-merge plain objects. Arrays and non-plain values from `override` replace `base`.
 * `undefined` values in `override` are ignored. Inputs are not mutated.
 *
 * @internal
 */
export function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown> | undefined): T {
  if (!override) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return out as T;
}
