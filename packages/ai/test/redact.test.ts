import { describe, expect, it } from 'vitest';
import { TestFlyError } from '@testfly/playwright';
import { redact } from '../src';

const NOENV = { env: {} };

describe('redact', () => {
  it('redacts JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const out = redact(`token=${jwt} end`, [], NOENV);
    expect(out).toBe('token=[REDACTED:jwt] end');
  });

  it('redacts bearer tokens (case-insensitive) but not short words', () => {
    expect(redact('Authorization: Bearer abcDEF123456.ghi-jkl_mno', [], NOENV)).toBe('Authorization: Bearer [REDACTED:token]');
    expect(redact('bearer abcdef0123456789abc', [], NOENV)).toContain('[REDACTED:token]');
    expect(redact('Bearer short', [], NOENV)).toBe('Bearer short');
  });

  it('redacts sk- keys, AWS keys, GitHub / Google / Slack tokens', () => {
    expect(redact('k=sk-ant-api03-AbCdEfGhIjKlMnOp', [], NOENV)).toBe('k=[REDACTED:api-key]');
    expect(redact('AKIAIOSFODNN7EXAMPLE', [], NOENV)).toBe('[REDACTED:aws-key]');
    expect(redact('ASIAIOSFODNN7EXAMPLE', [], NOENV)).toBe('[REDACTED:aws-key]');
    expect(redact(`ghp_${'a'.repeat(36)}`, [], NOENV)).toBe('[REDACTED:github-token]');
    expect(redact(`AIza${'B'.repeat(35)}`, [], NOENV)).toBe('[REDACTED:google-key]');
    expect(redact('xoxb-1234567890-abcdefghij', [], NOENV)).toBe('[REDACTED:slack-token]');
  });

  it('redacts Luhn-valid card numbers (plain, spaces, dashes) and keeps non-Luhn numbers', () => {
    expect(redact('card 4111111111111111 ok', [], NOENV)).toBe('card [REDACTED:card] ok');
    expect(redact('card 4111 1111 1111 1111', [], NOENV)).toBe('card [REDACTED:card]');
    expect(redact('card 4111-1111-1111-1111', [], NOENV)).toBe('card [REDACTED:card]');
    expect(redact('order 4111111111111112', [], NOENV)).toBe('order 4111111111111112');
    expect(redact('id 1234567890123', [], NOENV)).toBe('id 1234567890123');
    expect(redact('phone 12345', [], NOENV)).toBe('phone 12345');
  });

  it('applies extra patterns (string and RegExp) and rejects invalid ones with TF_CONFIG_INVALID', () => {
    expect(redact('user=alice123 id=ACME-77', ['alice\\d+', /ACME-\d+/], NOENV)).toBe('user=[REDACTED] id=[REDACTED]');
    expect(redact('a b a', [/a/i], NOENV)).toBe('[REDACTED] b [REDACTED]');
    try {
      redact('x', ['(unclosed'], NOENV);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TestFlyError);
      expect((e as TestFlyError).code).toBe('TF_CONFIG_INVALID');
    }
  });

  it('redacts values of secret-looking env vars (len >= 6) and ignores others', () => {
    const env = {
      MY_SECRET: 's3cr3t-value',
      GITHUB_TOKEN: 'tok_abcdef',
      DB_PASSWORD: 'p@ss.word(1)',
      OPENAI_API_KEY: 'plainkey99',
      SSH_PRIVATE_KEY: 'privatevalue',
      SHORT_SECRET: 'abc',
      HOME: '/home/someone',
      LOWER_token: 'lowercase-tok',
    };
    const text = 'a s3cr3t-value b tok_abcdef c p@ss.word(1) d plainkey99 e privatevalue f abc g /home/someone h lowercase-tok';
    const out = redact(text, [], { env });
    expect(out).toBe('a [REDACTED:env] b [REDACTED:env] c [REDACTED:env] d [REDACTED:env] e [REDACTED:env] f abc g /home/someone h [REDACTED:env]');
  });

  it('defaults to process.env', () => {
    process.env.TF_TEST_SECRET_X = 'very-secret-env-value';
    try {
      expect(redact('x very-secret-env-value y')).toBe('x [REDACTED:env] y');
      expect(redact('x very-secret-env-value y', [], { env: {} })).toBe('x very-secret-env-value y');
    } finally {
      delete process.env.TF_TEST_SECRET_X;
    }
  });

  it('prefers the longer env value when one contains another', () => {
    const out = redact('abcdef-long', [], { env: { A_TOKEN: 'abcdef', B_TOKEN: 'abcdef-long' } });
    expect(out).toBe('[REDACTED:env]');
  });

  it('does NOT redact e-mail addresses', () => {
    expect(redact('mail me at jane.doe@example.com please', [], NOENV)).toBe('mail me at jane.doe@example.com please');
  });

  it('leaves ordinary text untouched', () => {
    const t = 'Click the "Sign in" button; total: $1,234.56 (3 items)';
    expect(redact(t, [], NOENV)).toBe(t);
  });
});
