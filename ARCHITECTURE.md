# TestFly Playwright — Mimari Tasarım (`ARCHITECTURE.md`)

Bu doküman, `@testfly/playwright` kütüphanesinin iç çalışma prensiplerini, katmanlarını ve teknik tasarım kararlarını detaylandırır.

---

## 1. Temel Tasarım İlkeleri

1. **Zero-Boilerplate (Sıfır Şablon Kod):** Kullanıcı `createBdd(test)` gibi köprü fonksiyonlarını çağırmaz. `@testfly/playwright` doğrudan hazır `Given, When, Then, test, expect` nesnelerini sunar.
2. **Native Playwright Execution:** Kod `playwright-bdd` aracılığıyla doğrudan Playwright test dosyalarına transpile edilir ve standart `@playwright/test` runner'ı üzerinde çalışır.
3. **Batteries-Included Fixtures:** UI, REST API, Veritabanı, E-posta ve Adım Loglama aynı test yaşam döngüsüne entegre edilir.
4. **Strict Type-Safety:** Konfigürasyon ve veri modelleri TypeScript & Zod ile doğrulanır.

---

## 2. Katmanlı Mimari (Layers)

### Katman 1: Public API & BDD Sarmalama
Dış dünyaya açık arayüz tek bir giriş noktasından (`index.ts`) sunulur:

```typescript
// @testfly/playwright/src/index.ts
import { createBdd } from 'playwright-bdd';
import { test as baseTestFlyTest } from './fixtures';

// BDD anahtar kelimeleri paket içinde bir kez bağlanıp doğrudan dışa aktarılır
export const { Given, When, Then, Before, After, Step } = createBdd(baseTestFlyTest);

// Standart spec testleri için genişletilmiş test nesnesi
export const test = baseTestFlyTest;
export { expect } from '@playwright/test';

// Konfigürasyon yardımcısı
export { defineTestFlyConfig } from './config';
```

### Katman 2: Fixture Engine (`test.extend`)
Playwright'ın güçlü fixture sistemi üzerinden TestFly araçları inject edilir:

```typescript
// @testfly/playwright/src/fixtures/index.ts
import { test as base } from '@playwright/test';
import { ApiClient } from '../client/ApiClient';
import { StepLogger } from '../steps/StepLogger';
import { DbClient } from '../db/DbClient';
import { MailClient } from '../mail/MailClient';

export interface TestFlyFixtures {
  api: ApiClient;
  db: DbClient;
  mail: MailClient;
  step: StepLogger;
}

export const test = base.extend<TestFlyFixtures>({
  api: async ({ request }, use) => {
    const apiClient = new ApiClient(request);
    await use(apiClient);
  },
  db: async ({}, use) => {
    const dbClient = new DbClient();
    await use(dbClient);
    await dbClient.cleanup();
  },
  mail: async ({}, use) => {
    const mailClient = new MailClient();
    await use(mailClient);
  },
  step: async ({}, use) => {
    const stepLogger = new StepLogger();
    await use(stepLogger);
  },
});
```

### Katman 3: Konfigürasyon Motoru (`testfly.config.ts`)
Zod ile doğrulanan, çoklu ortam (dev, staging, prod) destekleyen konfigürasyon yapısı:

```typescript
import { z } from 'zod';

export const TestFlyConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiBaseUrl: z.string().url().optional(),
  env: z.enum(['local', 'dev', 'staging', 'prod']).default('local'),
  database: z.object({
    connectionString: z.string().optional(),
    type: z.enum(['postgres', 'mysql', 'mongodb']).optional(),
  }).optional(),
  mail: z.object({
    provider: z.enum(['mailpit', 'mailtrap', 'imap']).optional(),
    url: z.string().optional(),
  }).optional(),
});

export type TestFlyConfig = z.infer<typeof TestFlyConfigSchema>;

export function defineTestFlyConfig(config: TestFlyConfig): TestFlyConfig {
  return TestFlyConfigSchema.parse(config);
}
```

---

## 3. Dizin ve Dosya Yapısı (Monorepo / Package)

```
testfly-playwright/
├── packages/
│   └── testfly-playwright/
│       ├── src/
│       │   ├── index.ts              # Ana export noktası
│       │   ├── bdd.ts                # playwright-bdd entegrasyonu
│       │   ├── fixtures/             # Custom fixture'lar
│       │   │   ├── index.ts
│       │   │   ├── api.fixture.ts
│       │   │   ├── db.fixture.ts
│       │   │   └── mail.fixture.ts
│       │   ├── client/               # Fluent REST API Client
│       │   │   └── ApiClient.ts
│       │   ├── db/                   # DB yardımcıları
│       │   ├── mail/                 # Mail yardımcıları
│       │   ├── steps/                # StepLogger
│       │   ├── config/               # Zod config loader
│       │   └── cli/                  # CLI araçları (npx testfly init)
│       ├── package.json
│       ├── tsconfig.json
│       └── tsup.config.ts
├── examples/
│   └── starter-demo/                 # Örnek BDD + Spec projesi
│       ├── features/
│       │   └── auth.feature
│       ├── steps/
│       │   └── auth.steps.ts
│       ├── tests/
│       │   └── api.spec.ts
│       ├── testfly.config.ts
│       └── playwright.config.ts
└── README.md
```
