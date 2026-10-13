import { describe, it, expect } from 'vitest';
import { FakerClient } from '../src/clients/faker/FakerClient';


describe('FakerClient', () => {
  const faker = new FakerClient();

  it('should generate person details and valid TCKN', () => {
    const fullName = faker.person.fullName();
    expect(fullName).toContain(' ');

    const tc = faker.person.tcKimlik();
    expect(tc).toHaveLength(11);
    expect(tc[0]).not.toBe('0');

    // Validate 11-digit TCKN checksum algorithm
    const digits = tc.split('').map(Number);
    const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
    const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
    let d10 = (oddSum * 7 - evenSum) % 10;
    if (d10 < 0) d10 += 10;
    expect(digits[9]).toBe(d10);

    const totalSum = digits.slice(0, 10).reduce((a, b) => a + b, 0);
    expect(digits[10]).toBe(totalSum % 10);
  });

  it('should generate valid credit card number matching Luhn algorithm', () => {
    const cc = faker.finance.creditCardNumber('visa');
    expect(cc).toHaveLength(16);
    expect(cc.startsWith('4')).toBe(true);

    // Luhn checksum validation
    const digits = cc.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let val = digits[digits.length - 1 - i];
      if (i % 2 === 1) {
        val *= 2;
        if (val > 9) val -= 9;
      }
      sum += val;
    }
    expect(sum % 10).toBe(0);
  });

  it('should generate internet, phone, address and datatype fields', () => {
    const email = faker.internet.email('Ahmet', 'Yilmaz');
    expect(email).toContain('@');
    expect(email).toContain('ahmet.yilmaz');

    const phone = faker.phone.phoneNumber();
    expect(phone.startsWith('+90 5')).toBe(true);

    const uuid = faker.datatype.uuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const num = faker.datatype.number(10, 20);
    expect(num).toBeGreaterThanOrEqual(10);
    expect(num).toBeLessThanOrEqual(20);

    const city = faker.address.city();
    expect(city).toBeDefined();
  });
});
