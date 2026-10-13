const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX = /^[0-9a-f]{16,}$/i;

/**
 * Collapse a URL into a route pattern: pathname with numeric / uuid / long-hex segments
 * replaced by `:id` (hash routes `#/a/1` are included).
 *
 * @internal
 */
export function urlPattern(url: string): string {
  let path = url;
  try {
    const u = new URL(url);
    path = u.pathname;
    if (u.hash.startsWith('#/')) path += u.hash.slice(1).split('?')[0];
  } catch {
    path = url.split(/[?#]/)[0];
  }
  const normalized = path
    .split('/')
    .map((seg) => (/^\d+$/.test(seg) || UUID.test(seg) || LONG_HEX.test(seg) ? ':id' : seg))
    .join('/');
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized || '/';
}

/** Lower-case, trim and collapse whitespace so trivially different goals share a key. @internal */
export function normalizeGoal(goal: string): string {
  return goal.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Action-cache key: `<urlPattern>::<normalized goal>`. @internal */
export function actionKey(url: string, goal: string): string {
  return `${urlPattern(url)}::${normalizeGoal(goal)}`;
}

/** Intent-cache key: `<urlPattern>::intent::<normalized intent>`. @internal */
export function intentKey(url: string, intent: string): string {
  return `${urlPattern(url)}::intent::${normalizeGoal(intent)}`;
}
