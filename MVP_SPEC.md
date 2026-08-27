# TestFly Playwright — MVP Spesifikasyonu (`MVP_SPEC.md`)

Bu doküman, **`@testfly/playwright` v0.1.0 (MVP)** sürümünün kapsamını, teslim edilecek bileşenlerini ve kabul kriterlerini tanımlar.

---

## 🎯 MVP Hedefi
Kullanıcının projeye `@testfly/playwright` ekleyip **5 dakika içinde** sıfır boilerplate ile hem BDD (`.feature`) hem de saf TypeScript (`.spec.ts`) testlerini çalıştırabilmesini sağlamak.

---

## 📦 MVP Kapsamındaki Bileşenler

### 1. Çekirdek Paket Kurulumu
- **Build Tool:** `tsup` (Hem ESM hem CJS çıktıları üretecek şekilde konfigüre edilir).
- **TypeScript:** Strict mode (`noImplicitAny`, `strictNullChecks`).
- **Dependencies:** `@playwright/test`, `playwright-bdd`, `zod`.

### 2. Zero-Boilerplate BDD Entegrasyonu
- Kullanıcı `createBdd(test)` yapmadan doğrudan import eder:
  ```typescript
  import { Given, When, Then, Before, After } from '@testfly/playwright';
  ```
- Arka planda `playwright-bdd` entegrasyonu hazır gelir.

### 3. Akıcı REST API Fixture (`api`)
- Playwright `APIRequestContext` üzerine inşa edilmiş akıcı istemci:
  ```typescript
  test('API Testi', async ({ api }) => {
    const res = await api.get('/users/1');
    expect(res.status).toBe(200);
    expect(res.data.name).toBe('John');
  });
  ```
- Otomatik header & auth token enjeksiyonu.

### 4. Adım Loglama Fixture (`step`)
- Raporlarda timeline ve adım adım çıktı üreten `step` fixture'ı:
  ```typescript
  await step.info('Kullanıcı ödeme sayfasına yönlendirildi');
  ```

### 5. Type-Safe Konfigürasyon (`testfly.config.ts`)
- `defineTestFlyConfig` fonksiyonu ile IDE autocomplete ve Zod doğrulama desteği:
  ```typescript
  import { defineTestFlyConfig } from '@testfly/playwright';

  export default defineTestFlyConfig({
    baseUrl: 'https://demo.testfly.io',
    apiBaseUrl: 'https://api.testfly.io',
    env: 'local',
  });
  ```

### 6. CLI Başlatıcı (`npx testfly init`)
- Kullanıcı yeni bir projede `npx testfly init` çalıştırdığında:
  1. `playwright.config.ts` ve `testfly.config.ts` dosyalarını otomatik oluşturur.
  2. Örnek `features/demo.feature` ve `steps/demo.steps.ts` dosyalarını ekler.
  3. `package.json` içine `test` ve `test:bdd` script'lerini yerleştirir.

---

## 🧪 MVP Kabul Kriterleri (Acceptance Criteria)

1. [ ] `npm install -D @testfly/playwright` ile kurulabilmeli.
2. [ ] `npx testfly init` çalıştırıldığında çalışan bir örnek şablon oluşmalı.
3. [ ] `npx playwright test` çalıştırıldığında hem `.feature` BDD testleri hem de `.spec.ts` testleri hatasız koşmalı.
4. [ ] Playwright HTML Raporu ve Trace Viewer sorunsuz açılabilmeli.
5. [ ] BDD step'leri içinde `{ api, page, step }` fixture'ları sorunsuz kullanılabilmeli.
