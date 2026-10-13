import { randomInt } from 'node:crypto';

/** mulberry32: tiny, fast, deterministic 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Test-data generator. Pass a `seed` for fully reproducible data (same seed, same sequence);
 * without a seed a random seed is chosen and exposed as {@link FakerClient.seed} so a failing run can be replayed.
 *
 * @public
 */
export class FakerClient {
  /** The seed in use (given or auto-chosen). */
  readonly seed: number;
  private readonly rng: () => number;

  constructor(seed?: number) {
    this.seed = seed ?? randomInt(0, 2 ** 31);
    this.rng = mulberry32(this.seed);
  }

  public person = {
    firstNames: [
      'Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Mustafa', 'Zeynep', 'Ali', 'Emine', 'Hüseyin', 'Hatice',
      'Can', 'Deniz', 'Elif', 'Burak', 'Selin', 'Murat', 'Ece', 'Oğuz', 'Büşra', 'Cem',
      'John', 'Jane', 'Alex', 'Emily', 'Michael', 'Sarah', 'David', 'Laura', 'James', 'Emma'
    ],
    lastNames: [
      'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir',
      'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek',
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor'
    ],
    firstName: (): string => {
      return this.randomPick(this.person.firstNames);
    },
    lastName: (): string => {
      return this.randomPick(this.person.lastNames);
    },
    fullName: (): string => {
      return `${this.person.firstName()} ${this.person.lastName()}`;
    },
    /**
     * Generates a mathematically valid 11-digit Turkish Republic ID Number (TCKN)
     */
    tcKimlik: (): string => {
      const digits: number[] = [this.int(1, 9)]; // 1-9
      for (let i = 1; i < 9; i++) {
        digits.push(this.int(0, 9));
      }

      // 10th digit formula: ((sum of 1,3,5,7,9th digits * 7) - sum of 2,4,6,8th digits) % 10
      const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
      const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
      let d10 = (oddSum * 7 - evenSum) % 10;
      if (d10 < 0) d10 += 10;
      digits.push(d10);

      // 11th digit formula: sum of first 10 digits % 10
      const totalSum = digits.reduce((a, b) => a + b, 0);
      const d11 = totalSum % 10;
      digits.push(d11);

      return digits.join('');
    },
  };

  public internet = {
    domains: ['testfly.io', 'example.com', 'mail.com', 'test.dev', 'company.org'],
    email: (firstName?: string, lastName?: string): string => {
      const f = (firstName || this.person.firstName()).toLowerCase().replace(/[^a-z0-9]/g, '');
      const l = (lastName || this.person.lastName()).toLowerCase().replace(/[^a-z0-9]/g, '');
      const rand = this.int(100, 998);
      const domain = this.randomPick(this.internet.domains);
      return `${f}.${l}${rand}@${domain}`;
    },
    username: (): string => {
      const f = this.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
      const rand = this.int(1000, 9998);
      return `${f}_${rand}`;
    },
    password: (length: number = 12): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
      let pass = '';
      for (let i = 0; i < length; i++) {
        pass += chars.charAt(this.int(0, chars.length - 1));
      }
      return pass;
    },
    url: (): string => {
      return `https://${this.randomPick(this.internet.domains)}/page-${this.int(0, 99)}`;
    },
  };

  public phone = {
    phoneNumber: (prefix: string = '+90 5'): string => {
      const operator = this.randomPick(['30', '32', '35', '41', '42', '52', '55']);
      const part1 = this.int(100, 998);
      const part2 = this.int(10, 98);
      const part3 = this.int(10, 98);
      return `${prefix}${operator} ${part1} ${part2} ${part3}`;
    },
  };

  public finance = {
    /**
     * Generates a valid test credit card number (Luhn Algorithm compliant)
     */
    creditCardNumber: (brand: 'visa' | 'mastercard' = 'visa'): string => {
      const prefix = brand === 'visa' ? '4' : '51';
      const length = 16;
      const digits: number[] = prefix.split('').map(Number);

      while (digits.length < length - 1) {
        digits.push(this.int(0, 9));
      }

      // Luhn checksum calculation
      let sum = 0;
      for (let i = 0; i < digits.length; i++) {
        let cardNum = digits[digits.length - 1 - i];
        if (i % 2 === 0) {
          cardNum *= 2;
          if (cardNum > 9) cardNum -= 9;
        }
        sum += cardNum;
      }

      const checkDigit = (10 - (sum % 10)) % 10;
      digits.push(checkDigit);

      return digits.join('');
    },
    cvv: (): string => {
      return String(this.int(100, 998));
    },
    expiryDate: (): string => {
      const month = String(this.int(1, 12)).padStart(2, '0');
      const year = String(new Date().getFullYear() + this.int(1, 5)).slice(-2);
      return `${month}/${year}`;
    },
    iban: (countryCode: string = 'TR'): string => {
      const randDigits = Array.from({ length: 24 }, () => this.int(0, 9)).join('');
      return `${countryCode}${randDigits}`;
    },
  };

  public address = {
    cities: ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Eskişehir', 'Trabzon', 'London', 'New York', 'Berlin'],
    streets: ['Atatürk Caddesi', 'İstiklal Sokak', 'Cumhuriyet Bulvarı', 'Bağdat Caddesi', 'Gül Sokak', 'Main Street', 'Baker Street'],
    city: (): string => this.randomPick(this.address.cities),
    street: (): string => `${this.randomPick(this.address.streets)} No: ${this.int(1, 150)}`,
    zipCode: (): string => String(this.int(10000, 99998)),
    country: (): string => 'Türkiye',
  };

  public datatype = {
    uuid: (): string => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = this.int(0, 15);
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    },
    number: (min: number = 0, max: number = 100): number => {
      return this.int(min, max);
    },
    boolean: (): boolean => {
      return this.rng() > 0.5;
    },
    string: (length: number = 8): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let res = '';
      for (let i = 0; i < length; i++) {
        res += chars.charAt(this.int(0, chars.length - 1));
      }
      return res;
    },
  };

  private int(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  private randomPick<T>(array: T[]): T {
    return array[this.int(0, array.length - 1)];
  }
}
