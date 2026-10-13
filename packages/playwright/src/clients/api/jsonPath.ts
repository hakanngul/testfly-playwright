/**
 * Tiny JSONPath subset used by `ApiResponse.jsonPath()`.
 *
 * Supported: `$`, `.name`, `['name']` / `["name"]`, `[0]`, `[-1]`, `[*]`, `.*`.
 * Not supported: filters, recursive descent, slices.
 *
 * @internal
 */
export interface JsonPathResult {
  /** All matched values (a path without wildcards yields 0 or 1 values). */
  values: unknown[];
  /** True when the path contains a wildcard and should be treated as a list. */
  multi: boolean;
}

type Token = { kind: 'key'; key: string } | { kind: 'index'; index: number } | { kind: 'wildcard' };

function tokenize(path: string): Token[] {
  let i = 0;
  const src = path.trim();
  if (!src.startsWith('$')) throw new Error(`JSON path must start with "$": ${path}`);
  i = 1;
  const tokens: Token[] = [];
  while (i < src.length) {
    const ch = src[i];
    if (ch === '.') {
      i++;
      if (src[i] === '*') {
        tokens.push({ kind: 'wildcard' });
        i++;
        continue;
      }
      let j = i;
      while (j < src.length && src[j] !== '.' && src[j] !== '[') j++;
      const key = src.slice(i, j);
      if (!key) throw new Error(`Invalid JSON path (empty key at ${i}): ${path}`);
      tokens.push({ kind: 'key', key });
      i = j;
    } else if (ch === '[') {
      const end = findClosingBracket(src, i);
      if (end < 0) throw new Error(`Invalid JSON path (unclosed "["): ${path}`);
      const inner = src.slice(i + 1, end).trim();
      if (inner === '*') tokens.push({ kind: 'wildcard' });
      else if (/^-?\d+$/.test(inner)) tokens.push({ kind: 'index', index: Number(inner) });
      else if ((inner.startsWith("'") && inner.endsWith("'")) || (inner.startsWith('"') && inner.endsWith('"'))) {
        tokens.push({ kind: 'key', key: inner.slice(1, -1) });
      } else throw new Error(`Invalid JSON path segment "[${inner}]": ${path}`);
      i = end + 1;
    } else {
      throw new Error(`Invalid JSON path (unexpected "${ch}" at ${i}): ${path}`);
    }
  }
  return tokens;
}

function findClosingBracket(src: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === ']') return i;
  }
  return -1;
}

/** @internal */
export function queryJsonPath(data: unknown, path: string): JsonPathResult {
  const tokens = tokenize(path);
  let current: unknown[] = [data];
  let multi = false;
  for (const token of tokens) {
    const next: unknown[] = [];
    // A wildcard always yields a list, even when nothing matched before it.
    if (token.kind === 'wildcard') multi = true;
    for (const node of current) {
      if (node === null || typeof node !== 'object') continue;
      if (token.kind === 'wildcard') {
        next.push(...(Array.isArray(node) ? node : Object.values(node as Record<string, unknown>)));
      } else if (token.kind === 'index') {
        if (!Array.isArray(node)) continue;
        const idx = token.index < 0 ? node.length + token.index : token.index;
        if (idx >= 0 && idx < node.length) next.push(node[idx]);
      } else if (Object.prototype.hasOwnProperty.call(node, token.key)) {
        next.push((node as Record<string, unknown>)[token.key]);
      }
    }
    current = next;
  }
  return { values: current, multi };
}
