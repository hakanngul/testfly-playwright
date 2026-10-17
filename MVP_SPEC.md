# TestFly Playwright — MVP Spesifikasyonu (`MVP_SPEC.md`)

Bu doküman TestFly'ın ilk yayınlanacak sürümünün (`0.2.0`, şu an `0.2.0-next.0`) kapsamını, bileşenlerini ve kabul kriterlerini tanımlar. Mimari kararlar: [`docs/adr/ADR-001.md`](./docs/adr/ADR-001.md).

---

## MVP Hedefi

Kullanıcı `npm create testfly@latest` veya `npx testfly init` ile **5 dakika içinde**, sıfır şablon kodla hem BDD (`.feature`) hem de saf TypeScript (`.spec.ts`) testlerini koşturabilmeli. Testler tipli YAML locator'lar, self-healing ve stabilite raporlarıyla birlikte gelmeli.

---

## MVP Kapsamındaki Bileşenler

### 1. Monorepo ve paket kurulumu
- pnpm workspace (`packages/*`), `tsup` (kütüphaneler için ESM + CJS + `.d.ts`), TypeScript strict, Node.js >= 22.
- Yayınlanacak paketler: `@testfly/playwright`, `@testfly/reporter`, `@testfly/ai`, `create-testfly`.
- `@testfly/mobile` MVP kapsamı **dışındadır** (deneysel, private).

### 2. Konfigürasyon (`playwright.config.ts`)
- Ayrı bir `testfly.config.ts` yoktur. Seçenekler Playwright config'inin `testfly` anahtarında yaşar ve zod ile doğrulanır:
  ```ts
  import { defineConfig } from '@testfly/playwright/config';

  export default defineConfig({
    testfly: { baseUrl: 'https://demo.playwright.dev/todomvc', env: 'local' },
  });
  ```
- `${VAR}` / `.env` çözümü, `profiles` + `TESTFLY_ENV`, proje bazlı `use: { testfly }` override'ları.

### 3. Zero-boilerplate BDD
- Kullanıcı `createBdd` çağırmaz; step'ler BDD giriş noktasından import edilir:
  ```ts
  import { Given, When, Then, Before, After, expect } from '@testfly/playwright/bdd';
  ```
- `testfly.bdd` tanımlıysa `defineConfig` `playwright-bdd`'yi otomatik bağlar. `testfly test`, `bddgen`'i ardından `playwright test`'i çalıştırır.

### 4. Tipli YAML locator'lar ve self-healing
- `locators/<sayfa>.yaml`: üst düzey anahtarlar locator'dır, sayfa adı dosya adından gelir.
  ```yaml
  # locators/todo.yaml
  new_todo:
    placeholder: What needs to be done?
    fallbacks:
      - css: ".new-todo"
  ```
- `testfly locators` → `locators/index.d.ts`. `locate('todo.new_todo')` için IDE otomatik tamamlaması (bilinmeyen anahtarlar çalışma zamanında `TF_LOCATOR_NOT_FOUND` verir).
- Healing: YAML fallbacks → rules → fuzzy (`healing.mode: 'rules'`, varsayılan). AI healing opsiyoneldir (`@testfly/ai`).

### 5. Fixture'lar
- Çekirdek: `testfly`, `ctx` (TestContext), `step`, `faker`.
- `api`: Playwright `APIRequestContext` üzerinde akıcı HTTP istemcisi:
  ```ts
  test('API', async ({ api }) => {
    const res = await api.get('/users/1');
    res.expectStatus(200).expectJson('$.name', 'John');
  });
  ```
- `step`: timeline ve reporter'a akan adım logları:
  ```ts
  await step('Ödeme', async () => { /* ... */ });
  await step.info('Kullanıcı ödeme sayfasına yönlendirildi');
  ```
- Veri: `db` (postgres/mysql/mock), `redis`, `mail` (mailpit/mailtrap/imap/mock). Config ve opsiyonel sürücü gerektirir.
- Kalite: `a11y`, `visual`, `perf`, `form`. Diğer: `mock`, `session`.

### 6. Reporter (`@testfly/reporter`)
- `defineConfig` tarafından otomatik eklenir. Geçmiş, Flakiness Radar, kural tabanlı triage, karantina (`testfly-quarantine.yml`), kalite kapısı, LPT sharding, `.testfly/report/index.html` dashboard'u.

### 7. CLI
- `create-testfly`: `npm create testfly@latest <dizin> [--bdd] [--pm npm|pnpm|yarn]`.
- `testfly init`: mevcut projede `playwright.config.ts`, örnek test, `locators/`, BDD örneği (`--no-bdd` ile atlanır), `.gitignore` girdileri ve `package.json` script'leri (var olanları ezmeden).
- Diğerleri: `doctor`, `locators`, `steps`, `generate --swagger`, `test`, `clean`, `shard`, `quarantine list`, `report`, `ci`.

---

## MVP Kabul Kriterleri

Durum depodaki kod ve testlere göre işaretlenmiştir.

1. [ ] `npm install -D @testfly/playwright` ile kurulabilmeli. *(Paketler henüz npm'e yayınlanmadı.)*
2. [x] `npm create testfly@latest <dizin>` çalışan bir şablon oluşturmalı. *(`packages/create-testfly/test/create.test.ts`)*
3. [x] `npx testfly init` çalışan bir örnek şablon oluşturmalı. *(`packages/playwright/test/cli/init.test.ts`)*
4. [ ] `npx testfly test` ile hem `.feature` BDD testleri hem de `.spec.ts` testleri hatasız koşmalı. *(Spec tarafı `packages/playwright/e2e` ile koşuluyor; iskelet oluşturulmuş bir BDD projesinin uçtan uca koşumu otomatik testle henüz doğrulanmıyor.)*
5. [ ] Playwright HTML raporu, Trace Viewer ve TestFly dashboard'u sorunsuz açılabilmeli. *(Dashboard üretimi reporter testlerinde doğrulanıyor; `testfly report` ile açılış manuel doğrulama gerektirir.)*
6. [x] BDD step'leri içinde `{ page, locate, api, step, ctx }` fixture'ları kullanılabilmeli. *(`@testfly/playwright/bdd`, `test`'i tüm TestFly fixture'larıyla birleştirir.)*
7. [x] Eksik config/bağımlılık durumunda kodlu ve ipuçlu `TestFlyError` fırlatılmalı (sessiz sahte veri yok). *(`packages/playwright/test/core/errors.test.ts`, fixture testleri)*
8. [ ] Örnek projeler (`examples/`) güncel API ile çalışmalı. *(Örnekler hâlâ eski API'yi kullanıyor; geçiş gerekiyor.)*
