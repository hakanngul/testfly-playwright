export class FakerClient {
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
    firstName: (gender?: 'male' | 'female'): string => {
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
      const digits: number[] = [Math.floor(Math.random() * 9) + 1]; // 1-9
      for (let i = 1; i < 9; i++) {
        digits.push(Math.floor(Math.random() * 10));
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
      const rand = Math.floor(Math.random() * 899 + 100);
      const domain = this.randomPick(this.internet.domains);
      return `${f}.${l}${rand}@${domain}`;
    },
    username: (): string => {
      const f = this.person.firstName().toLowerCase().replace(/[^a-z0-9]/g, '');
      const rand = Math.floor(Math.random() * 8999 + 1000);
      return `${f}_${rand}`;
    },
    password: (length: number = 12): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
      let pass = '';
      for (let i = 0; i < length; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return pass;
    },
    url: (): string => {
      return `https://${this.randomPick(this.internet.domains)}/page-${Math.floor(Math.random() * 100)}`;
    },
  };

  public phone = {
    phoneNumber: (prefix: string = '+90 5'): string => {
      const operator = this.randomPick(['30', '32', '35', '41', '42', '52', '55']);
      const part1 = Math.floor(Math.random() * 899 + 100);
      const part2 = Math.floor(Math.random() * 89 + 10);
      const part3 = Math.floor(Math.random() * 89 + 10);
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
        digits.push(Math.floor(Math.random() * 10));
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
      return String(Math.floor(Math.random() * 899 + 100));
    },
    expiryDate: (): string => {
      const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
      const year = String(new Date().getFullYear() + Math.floor(Math.random() * 5) + 1).slice(-2);
      return `${month}/${year}`;
    },
    iban: (countryCode: string = 'TR'): string => {
      const randDigits = Array.from({ length: 24 }, () => Math.floor(Math.random() * 10)).join('');
      return `${countryCode}${randDigits}`;
    },
  };

  public address = {
    cities: ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Eskişehir', 'Trabzon', 'London', 'New York', 'Berlin'],
    streets: ['Atatürk Caddesi', 'İstiklal Sokak', 'Cumhuriyet Bulvarı', 'Bağdat Caddesi', 'Gül Sokak', 'Main Street', 'Baker Street'],
    city: (): string => this.randomPick(this.address.cities),
    street: (): string => `${this.randomPick(this.address.streets)} No: ${Math.floor(Math.random() * 150) + 1}`,
    zipCode: (): string => String(Math.floor(Math.random() * 89999 + 10000)),
    country: (): string => 'Türkiye',
  };

  public datatype = {
    uuid: (): string => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    },
    number: (min: number = 0, max: number = 100): number => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    boolean: (): boolean => {
      return Math.random() > 0.5;
    },
    string: (length: number = 8): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let res = '';
      for (let i = 0; i < length; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return res;
    },
  };

  private randomPick<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }
}
