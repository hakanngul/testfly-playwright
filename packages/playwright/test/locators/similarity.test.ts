import { describe, it, expect } from 'vitest';
import { jaccard, levenshtein, normalizeText, normalizedLevenshtein, similarity, tokens } from '../../src/locators/healing/similarity';

describe('levenshtein', () => {
  it('handles identical, empty and classic cases', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('flaw', 'lawn')).toBe(2);
  });
  it('is symmetric', () => {
    expect(levenshtein('saturday', 'sunday')).toBe(levenshtein('sunday', 'saturday'));
    expect(levenshtein('saturday', 'sunday')).toBe(3);
  });
  it('normalizedLevenshtein is in 0..1', () => {
    expect(normalizedLevenshtein('', '')).toBe(1);
    expect(normalizedLevenshtein('abc', 'abc')).toBe(1);
    expect(normalizedLevenshtein('abc', 'xyz')).toBe(0);
    expect(normalizedLevenshtein('abcd', 'abce')).toBeCloseTo(0.75);
  });
});

describe('normalizeText / tokens / jaccard', () => {
  it('splits camelCase and punctuation', () => {
    expect(normalizeText('submitButton')).toBe('submit button');
    expect(normalizeText('  Log-in__Now! ')).toBe('log in now');
    expect(tokens('loginBtn')).toEqual(['login', 'btn']);
    expect(tokens('')).toEqual([]);
    expect(tokens('!!!')).toEqual([]);
  });
  it('keeps unicode letters', () => {
    expect(normalizeText('Çıkış Yap')).toBe('çıkış yap');
  });
  it('jaccard', () => {
    expect(jaccard([], ['a'])).toBe(0);
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(jaccard(['a', 'a'], ['a'])).toBe(1);
  });
});

describe('similarity', () => {
  it('is 1 for equal normalized strings and 0 for empty', () => {
    expect(similarity('Log In', 'log-in')).toBe(1);
    expect(similarity('submitBtn', 'submit_btn')).toBe(1);
    expect(similarity('', 'x')).toBe(0);
    expect(similarity('x', '!!')).toBe(0);
  });
  it('ranks close strings above distant ones', () => {
    expect(similarity('Sign in', 'Sign In now')).toBeGreaterThan(similarity('Sign in', 'Checkout'));
    // single-token typos get no Jaccard credit: 0.6 * 0.8
    expect(similarity('login', 'logn')).toBeCloseTo(0.48);
    expect(similarity('login', 'banana')).toBeLessThan(0.3);
  });
});
