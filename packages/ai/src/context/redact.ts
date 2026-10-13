import { TestFlyError } from '@testfly/playwright';

const BUILTIN: [RegExp, string][] = [
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED:jwt]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [REDACTED:token]'],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED:api-key]'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED:aws-key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, '[REDACTED:github-token]'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[REDACTED:google-key]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED:slack-token]'],
];

const SECRET_ENV_NAME = /(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE)/i;
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @public */
export interface RedactOptions {
  /**
   * Environment whose secret-looking values (names matching SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE,
   * length >= 6) are redacted literally. Defaults to `process.env`; pass `{}` to disable.
   */
  env?: Record<string, string | undefined>;
}

/**
 * Redact secrets from text that is about to leave the machine.
 *
 * Covers JWTs, bearer tokens, API keys (sk-…, AKIA…, ghp_…), Luhn-valid card numbers,
 * literal values of secret-looking environment variables and caller supplied patterns.
 * E-mail addresses are intentionally NOT redacted (tests need them).
 *
 * @param text input text
 * @param extraPatterns additional regex sources / RegExps (e.g. `testfly.ai.redact`)
 * @public
 */
export function redact(text: string, extraPatterns: (string | RegExp)[] = [], options: RedactOptions = {}): string {
  let out = text;

  const env = options.env ?? process.env;
  const literals = Object.entries(env)
    .filter(([name, value]) => SECRET_ENV_NAME.test(name) && typeof value === 'string' && value.length >= 6)
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length);
  for (const value of new Set(literals)) out = out.replace(new RegExp(escapeRegExp(value), 'g'), '[REDACTED:env]');

  for (const [re, label] of BUILTIN) out = out.replace(re, label);

  out = out.replace(CARD_CANDIDATE, (m) => {
    const digits = m.replace(/[ -]/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? '[REDACTED:card]' : m;
  });

  for (const p of extraPatterns) {
    let re: RegExp;
    try {
      re = typeof p === 'string' ? new RegExp(p, 'g') : new RegExp(p.source, p.flags.includes('g') ? p.flags : `${p.flags}g`);
    } catch (cause) {
      throw new TestFlyError('TF_CONFIG_INVALID', `Invalid testfly.ai.redact pattern: ${String(p)}`, { cause });
    }
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}
