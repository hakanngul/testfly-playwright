import { describe, expect, it } from 'vitest';
import { FakerClient } from '../../../src/clients/faker';

function sample(f: FakerClient) {
  return [
    f.person.firstName(),
    f.person.lastName(),
    f.person.fullName(),
    f.person.tcKimlik(),
    f.internet.email(),
    f.internet.username(),
    f.internet.password(16),
    f.internet.url(),
    f.phone.phoneNumber(),
    f.finance.creditCardNumber('mastercard'),
    f.finance.cvv(),
    f.finance.expiryDate(),
    f.finance.iban(),
    f.address.city(),
    f.address.street(),
    f.address.zipCode(),
    f.datatype.uuid(),
    f.datatype.number(1, 1000),
    f.datatype.boolean(),
    f.datatype.string(10),
  ];
}

describe('FakerClient determinism', () => {
  it('the same seed yields the same sequence across instances', () => {
    expect(sample(new FakerClient(1234))).toEqual(sample(new FakerClient(1234)));
  });

  it('different seeds yield different sequences', () => {
    expect(sample(new FakerClient(1))).not.toEqual(sample(new FakerClient(2)));
  });

  it('successive calls on one instance differ', () => {
    const f = new FakerClient(5);
    const ids = new Set(Array.from({ length: 50 }, () => f.datatype.uuid()));
    expect(ids.size).toBe(50);
  });

  it('exposes the given seed, and picks + exposes one when none is given so runs can be replayed', () => {
    expect(new FakerClient(42).seed).toBe(42);
    const auto = new FakerClient();
    expect(Number.isInteger(auto.seed)).toBe(true);
    expect(auto.seed).toBeGreaterThanOrEqual(0);
  });

  it('seed 0 is honoured (not treated as "no seed")', () => {
    expect(new FakerClient(0).seed).toBe(0);
    expect(sample(new FakerClient(0))).toEqual(sample(new FakerClient(0)));
  });

  it('a replay from the exposed seed reproduces the data of an auto-seeded client', () => {
    const a = new FakerClient();
    const first = sample(a);
    expect(sample(new FakerClient(a.seed))).toEqual(first);
  });
});

describe('FakerClient generators', () => {
  const f = new FakerClient(2024);
  const many = <T>(fn: () => T, n = 200): T[] => Array.from({ length: n }, fn);

  it('names come from the lists; fullName is first + last', () => {
    for (const n of many(() => f.person.firstName())) expect(f.person.firstNames).toContain(n);
    for (const n of many(() => f.person.lastName())) expect(f.person.lastNames).toContain(n);
    for (const n of many(() => f.person.fullName(), 50)) {
      const [first, ...rest] = n.split(' ');
      expect(f.person.firstNames).toContain(first);
      expect(f.person.lastNames).toContain(rest.join(' '));
    }
  });

  it('tcKimlik: 11 digits, no leading zero, both checksum digits valid', () => {
    for (const tc of many(() => f.person.tcKimlik())) {
      expect(tc).toMatch(/^[1-9]\d{10}$/);
      const d = tc.split('').map(Number);
      const d10 = (((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
      expect(d[9]).toBe(d10);
      expect(d[10]).toBe(d.slice(0, 10).reduce((a, b) => a + b, 0) % 10);
    }
  });

  it('credit cards: Luhn-valid, 16 digits, brand prefix', () => {
    const luhn = (num: string): boolean => {
      let sum = 0;
      for (let i = 0; i < num.length; i++) {
        let v = Number(num[num.length - 1 - i]);
        if (i % 2 === 1) {
          v *= 2;
          if (v > 9) v -= 9;
        }
        sum += v;
      }
      return sum % 10 === 0;
    };
    for (const n of many(() => f.finance.creditCardNumber('visa'))) {
      expect(n).toMatch(/^4\d{15}$/);
      expect(luhn(n)).toBe(true);
    }
    for (const n of many(() => f.finance.creditCardNumber('mastercard'))) {
      expect(n).toMatch(/^51\d{14}$/);
      expect(luhn(n)).toBe(true);
    }
    expect(f.finance.creditCardNumber()).toMatch(/^4/);
  });

  it('cvv, expiry (future, MM/YY), iban', () => {
    for (const c of many(() => f.finance.cvv())) expect(c).toMatch(/^\d{3}$/);
    const yy = new Date().getFullYear() % 100;
    for (const e of many(() => f.finance.expiryDate())) {
      const [mm, y] = e.split('/').map(Number);
      expect(e).toMatch(/^(0[1-9]|1[0-2])\/\d{2}$/);
      expect(mm).toBeGreaterThanOrEqual(1);
      expect(y).toBeGreaterThan(yy - 1);
      expect(y).toBeLessThanOrEqual(yy + 5);
    }
    expect(f.finance.iban()).toMatch(/^TR\d{24}$/);
    expect(f.finance.iban('DE')).toMatch(/^DE\d{24}$/);
  });

  it('email: given names are normalised (diacritics/space stripped), random otherwise', () => {
    expect(f.internet.email('Ahmet', 'Yılmaz')).toMatch(/^ahmet\.ylmaz\d{3}@/);
    expect(f.internet.email('Jane Q.', 'Doe-Smith')).toMatch(/^janeq\.doesmith\d{3}@/);
    for (const e of many(() => f.internet.email())) {
      expect(e).toMatch(/^[a-z0-9]*\.[a-z0-9]*\d{3}@[a-z.]+$/);
      expect(f.internet.domains).toContain(e.split('@')[1]);
    }
  });

  it('username, password (length + charset), url', () => {
    for (const u of many(() => f.internet.username())) expect(u).toMatch(/^[a-z0-9]*_\d{4}$/);
    expect(f.internet.password()).toHaveLength(12);
    expect(f.internet.password(0)).toBe('');
    expect(f.internet.password(40)).toMatch(/^[A-Za-z0-9!@#$%&*]{40}$/);
    for (const u of many(() => f.internet.url(), 30)) expect(() => new URL(u)).not.toThrow();
  });

  it('phone number format and custom prefix', () => {
    for (const p of many(() => f.phone.phoneNumber())) expect(p).toMatch(/^\+90 5\d{2} \d{3} \d{2} \d{2}$/);
    expect(f.phone.phoneNumber('+1 ')).toMatch(/^\+1 \d{2} \d{3} \d{2} \d{2}$/);
  });

  it('address helpers', () => {
    for (const c of many(() => f.address.city(), 30)) expect(f.address.cities).toContain(c);
    for (const s of many(() => f.address.street(), 30)) expect(s).toMatch(/ No: \d{1,3}$/);
    for (const z of many(() => f.address.zipCode(), 30)) expect(z).toMatch(/^\d{5}$/);
    expect(f.address.country()).toBe('Türkiye');
  });

  it('datatype: uuid v4 format, number range (inclusive, incl. min=max), boolean, string', () => {
    for (const u of many(() => f.datatype.uuid())) expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const nums = many(() => f.datatype.number(3, 5), 300);
    expect(Math.min(...nums)).toBe(3);
    expect(Math.max(...nums)).toBe(5);
    expect(f.datatype.number(7, 7)).toBe(7);
    for (const n of many(() => f.datatype.number())) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    }
    const bools = many(() => f.datatype.boolean(), 300);
    expect(bools.some(Boolean)).toBe(true);
    expect(bools.some((b) => !b)).toBe(true);
    expect(f.datatype.string()).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(f.datatype.string(25)).toMatch(/^[A-Za-z0-9]{25}$/);
  });

  it('output covers the value space (not stuck on one value)', () => {
    expect(new Set(many(() => f.person.firstName())).size).toBeGreaterThan(15);
  });
});
