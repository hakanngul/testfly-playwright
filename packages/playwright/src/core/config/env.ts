import fs from 'node:fs';
import path from 'node:path';
import { TestFlyError } from '../errors';

/**
 * Minimal `.env` parser (no dependency). Supports `KEY=value`, `export KEY=value`,
 * single/double quotes, `#` comments and `\n` escapes inside double quotes.
 *
 * @internal
 */
export function parseDotenv(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if (value.startsWith('"') && value.indexOf('"', 1) > 0) {
      value = value.slice(1, value.indexOf('"', 1)).replace(/\\n/g, '\n');
    } else if (value.startsWith("'") && value.indexOf("'", 1) > 0) {
      value = value.slice(1, value.indexOf("'", 1));
    } else {
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load `<cwd>/.env` if present. Values never override `process.env`.
 *
 * @internal
 */
export function loadDotenv(cwd: string = process.cwd()): Record<string, string> {
  const file = path.join(cwd, '.env');
  try {
    return parseDotenv(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/**
 * Recursively replace `${VAR}` / `${VAR:-default}` placeholders in every string value.
 * A missing variable without default throws `TF_CONFIG_INVALID` naming the variable.
 *
 * @internal
 */
export function resolvePlaceholders<T>(value: T, vars: Record<string, string | undefined>, trail = 'testfly'): T {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER, (_m, name: string, fallback: string | undefined) => {
      const found = vars[name];
      if (found !== undefined) return found;
      if (fallback !== undefined) return fallback;
      throw new TestFlyError('TF_CONFIG_INVALID', `Environment variable "${name}" referenced in ${trail} is not defined.`, {
        hint: `Export ${name} in your shell, add it to a .env file, or use \${${name}:-default}.`,
        details: { variable: name, path: trail },
      });
    }) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => resolvePlaceholders(item, vars, `${trail}[${i}]`)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolvePlaceholders(v, vars, `${trail}.${k}`);
    }
    return out as T;
  }
  return value;
}

/** Merge `.env` values (lower priority) and `process.env` (higher priority). @internal */
export function collectEnvVars(cwd: string = process.cwd()): Record<string, string | undefined> {
  return { ...loadDotenv(cwd), ...process.env };
}
