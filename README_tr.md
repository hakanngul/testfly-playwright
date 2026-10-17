# TestFly Playwright

> `@playwright/test` üzerine kurulu, sıfır şablon kodlu, tip güvenli ve "pilleri dahil" TypeScript framework'ü: BDD, self-healing destekli tipli YAML locator'lar, API/DB/mail fixture'ları, kalite kontrolleri ve stabilite analitiği.

[English](./README.md) | [Türkçe](./README_tr.md)

> **Durum:** yayın öncesi (`0.2.0-next.0`). Paketler henüz npm'e yayınlanmadı. API'ler 1.0 öncesinde değişebilir.

---

## Paketler

Bu depo bir pnpm monorepo'sudur (`packages/*`):

| Paket | Açıklama |
| :--- | :--- |
| [`@testfly/playwright`](./packages/playwright/README.md) | Çekirdek framework: `defineConfig`, fixture'lar (`ctx`, `step`, `faker`, `api`, `db`, `redis`, `mail`, `locate`, `a11y`, `visual`, `perf`, `form`, `mock`, `session`), BDD giriş noktası, `testfly` CLI. |
| [`@testfly/reporter`](./packages/reporter/README.md) | Bağımsız Playwright reporter'ı: koşum geçmişi, Flakiness Radar, kural tabanlı hata sınıflandırma (triage), karantina, kalite kapıları, LPT sharding, HTML dashboard. |
| [`@testfly/ai`](./packages/ai/README.md) | Opsiyonel AI katmanı: `ai.act()`, `ai.byIntent()`, `toSatisfyAi` / `toViolateAi`, AI healing stratejisi, isteğe bağlı hata analizi reporter'ı, kayıt/tekrar (record/replay) önbelleği. |
| [`create-testfly`](./packages/create-testfly/README.md) | Proje iskelet oluşturucu: `npm create testfly@latest`. |
| [`@testfly/mobile`](./packages/mobile/README.md) | **Deneysel, private, yayınlanmıyor.** [Mobilewright](https://mobilewright.dev) üzerinde native iOS/Android testleri (cihazları mobilecli sürer): `device`, `mobileScreen`, `mobileLocate` fixture'ları. Desteklenen API'nin parçası değildir. |

Tasarım kararları [`docs/adr/`](./docs/adr/) altında kayıtlıdır ([ADR-001](./docs/adr/ADR-001.md), [ADR-002](./docs/adr/ADR-002.md)).

---

## İlkeler

- **Native Playwright.** Her şey bir Playwright fixture'ı veya config yardımcısıdır. BDD senaryoları [`playwright-bdd`](https://github.com/vitalets/playwright-bdd) ile sıradan Playwright testlerine derlenir; Trace Viewer, UI modu, sharding ve worker izolasyonu değişmeden çalışır.
- **Config `playwright.config.ts` içinde yaşar.** `@testfly/playwright/config` içindeki `defineConfig`, `testfly` anahtarını zod ile doğrular ve sonucu testlere worker fixture'ı `testfly` olarak verir. Ayrı bir config dosyası ve global singleton yoktur.
- **Dürüst hatalar.** TestFly'ın her hatası sabit bir `code` (`TF_*`), mesaj ve genellikle bir `hint` içeren `TestFlyError`'dır. Eksik konfigürasyon veya opsiyonel bağımlılıklar hata fırlatır; TestFly sessizce sahte veriye düşmez. Bellek içi `mock` DB/mail arka uçları vardır ama yalnızca açıkça seçildiğinde kullanılır.
- **Tek veri sözleşmesi.** Worker'lar reporter ile yalnızca sürümlü content type'lara sahip Playwright attachment'ları üzerinden konuşur (`@testfly/reporter/schema`).

---

## Hızlı Başlangıç

### 1. Proje oluşturun

```bash
npm create testfly@latest my-tests          # features/steps örneği için --bdd ekleyin
cd my-tests
npm install
npx playwright install chromium
npx testfly locators                        # tipli locator anahtarlarını üret
npm test                                    # `testfly test` çalıştırır
```

Veya mevcut bir projeye ekleyin:

```bash
npm i -D @testfly/playwright @playwright/test
npx testfly init                            # config, örnek test, locator'lar, BDD örneği (atlamak için --no-bdd)
```

### 2. Yapılandırın (`playwright.config.ts`)

```ts
import { devices } from '@playwright/test';
import { defineConfig } from '@testfly/playwright/config';

export default defineConfig({
  testDir: './tests',
  testfly: {
    baseUrl: 'https://demo.playwright.dev/todomvc', // use.baseURL olarak da atanır
    env: 'local',                                   // veya TESTFLY_ENV
    healing: { mode: 'rules' },                     // off | rules | ai
    reporter: { qualityGate: { minPassRate: 95 } }, // @testfly/reporter otomatik eklenir
    profiles: { ci: { healing: { mode: 'off' } } }, // env / TESTFLY_ENV "ci" olduğunda derin birleştirilir
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

`defineConfig` ayrıca `${VAR}` yer tutucularını `process.env` ve `.env` dosyasından çözer, proje bazlı `use: { testfly: {...} }` override'larını derin birleştirir, `testfly.bdd` tanımlıysa `playwright-bdd`'yi bağlar ve `testfly.reporter.enabled` `false` değilse `@testfly/reporter`'ı ekler.

### 3. Locator'ları tanımlayın (`locators/login.yaml`)

Her dosya bir sayfadır; **dosya adı sayfa adıdır** ve **her üst düzey anahtar bir locator'dır**. Testlerde kullanılan anahtar `<dosya adı>.<anahtar>` şeklindedir.

```yaml
# locators/login.yaml  ->  locate('login.username'), locate('login.submit'), ...
username:
  role: textbox
  name: Username
password:
  label: Password
submit:
  role: button
  name: Login
  fallbacks:                 # birincil seçici bir şey bulamazsa sırayla denenir
    - testid: login-submit
    - css: "#login-btn"
error_banner: ".alert-error" # düz bir string CSS seçicisidir
```

Her tanım tam olarak bir seçici alanı kullanır: `role` (opsiyonel `name`, `exact`, `level` ile), `label`, `text`, `testid`, `placeholder`, `alt`, `title`, `css` veya `xpath`. Değiştiriciler: `nth`, `first`, `last`, `has_text`, `within` (üst locator'ın anahtarı) ve `fallbacks`. `web:` anahtarı tanımın takma adı olarak kabul edilir. `ios:`, `android:` ve `mobile:` blokları [`@testfly/mobile`](./packages/mobile/README.md) için native tanımları taşır; web `locate()` bunları kullanmaz.

IDE otomatik tamamlaması için tipli anahtarları üretin (`locators/index.d.ts` yazar). Derleme zamanında her string kabul edilir; bilinmeyen bir anahtar çalışma zamanında `TF_LOCATOR_NOT_FOUND` ile hata verir:

```bash
npx testfly locators
```

### 4. Test yazın

```ts
import { test, expect } from '@testfly/playwright';

test('login', { tag: '@smoke' }, async ({ page, locate, step }) => {
  await page.goto('/login');

  await step('Kimlik bilgilerini doldur', async () => {
    await locate('login.username').fill('standard_user');
    await locate('login.password').fill('secret_sauce');
  });
  await locate('login.submit').click();

  await expect(page).toHaveURL(/inventory/);
});
```

### 5. Veya BDD yazın

```ts
// playwright.config.ts
export default defineConfig({
  testfly: {
    baseUrl: 'https://example.com',
    bdd: { features: 'features/**/*.feature', steps: 'steps/**/*.ts' },
  },
});
```

```gherkin
# features/login.feature
Feature: Login
  @smoke
  Scenario: Successful login
    Given I open the login page
    When I log in as "standard_user"
    Then the inventory is visible
```

```ts
// steps/login.steps.ts
import { Given, When, Then, expect } from '@testfly/playwright/bdd';

Given('I open the login page', async ({ page }) => {
  await page.goto('/login');
});

When('I log in as {string}', async ({ locate }, user: string) => {
  await locate('login.username').fill(user);
  await locate('login.password').fill('secret_sauce');
  await locate('login.submit').click();
});

Then('the inventory is visible', async ({ page }) => {
  await expect(page).toHaveURL(/inventory/);
});
```

Step tanımları tüm TestFly fixture'larını alır. `npx testfly test` ile çalıştırın (BDD yapılandırılmışsa önce `bddgen` çalışır).

---

## Fixture'lar

Tüm fixture'lar `@testfly/playwright` içindeki `test` üzerinde (ve BDD step'lerinde) mevcuttur. Daha yalın bir kurulum için tekil setler (`coreTest`, `apiTest`, `dataTest`, `locatorTest`, `qualityTest`, `mockTest`, `sessionTest`, `quarantineTest`) `mergeTests` ile birleştirilebilir.

| Fixture | Kapsam | Amaç |
| :--- | :--- | :--- |
| `testfly` | worker | Çözümlenmiş TestFly seçenekleri. |
| `ctx` | test | Nokta yollu anahtar/değer deposu, `{{key}}` interpolasyonu, JSON/CSV yükleme (`ctx.load`, `ctx.loadJson`, `ctx.loadCsv`). |
| `step` | test | `step('başlık', gövde)` ve `step.info/pass/warn/fail/attach`; reporter'ı besler. |
| `faker` | test | Sahte veri (tekrarlanabilir değerler için `TESTFLY_FAKER_SEED`). |
| `locate` / `locators` | test / worker | Fallback ve self-healing destekli tipli YAML locator'lar. |
| `api` | test | HTTP istemcisi: yeniden deneme, auth yardımcıları, `graphql`, `pollUntil`, akıcı yanıt doğrulamaları. |
| `db`, `redis`, `mail` | worker | Postgres/MySQL, Redis ve posta kutusu istemcileri (config ve opsiyonel sürücü paketi gerekir). |
| `a11y`, `visual`, `perf`, `form` | test | axe-core denetimleri, ekran görüntüsü karşılaştırma, Web Vitals, akıllı form doldurma. |
| `mock` | test | Route mock'lama ve istek doğrulamaları. |
| `session` | test | Rol bazlı önbelleğe alınmış oturum (`defineSession` + `session.as(role)`). |

### Uçtan uca (full-stack) örnek

```ts
import { test, expect } from '@testfly/playwright';

test('e-posta OTP ile kayıt', async ({ api, db, mail, page, ctx }) => {
  const email = `user-${Date.now()}@example.test`;

  const res = await api.post('/api/register', { json: { email, name: 'Ada' } });
  res.expectStatus(201);
  ctx.set('userId', res.jsonPath('$.id'));

  const message = await mail.waitForEmail({ to: email, subject: /verification code/i, timeout: 30_000 });
  const code = mail.extractCode(message);

  await page.goto('/verify');
  await page.getByLabel('Code').fill(code!);
  await page.getByRole('button', { name: 'Verify' }).click();

  await db.expectValue('SELECT status FROM users WHERE id = $1', [ctx.require('userId')], 'ACTIVE');
});
```

Bu örnek için gereken config:

```ts
testfly: {
  api: { baseUrl: 'https://api.example.com' },
  db: { client: 'postgres', connectionString: '${DATABASE_URL}' }, // `pg` kurulu olmalı
  mail: { provider: 'mailpit', url: 'http://localhost:8025' },
}
```

Veritabanı istemcileri: `postgres` (`pg`), `mysql` (`mysql2`) veya açıkça seçilen bellek içi `mock`. Redis için `ioredis`, IMAP mail için `imapflow` gerekir. Mail sağlayıcıları: `mailpit`, `mailtrap`, `imap`, `mock`.

### Kalite kontrolleri

```ts
import { test } from '@testfly/playwright';

test('ana sayfa kalitesi', async ({ page, a11y, visual, perf }) => {
  await page.goto('/');

  await a11y.assertNoViolations({ tags: ['wcag2a', 'wcag2aa'] });
  await visual.assertSnapshot('home', { mask: ['.ad-banner'] });
  await perf.assertLcp(2500);
  await perf.assertCls(0.1);
  await perf.assertTtfb(600);
});
```

`perf.getVitals()` `ttfb`, `domContentLoaded`, `loadTime`, `fcp`, `lcp`, `cls` döndürür; tarayıcının raporlayamadığı metrik `null` olur (LCP/CLS yalnızca Chromium'da) ve bu metriği doğrulamak `TF_QUALITY_UNSUPPORTED` fırlatır.

### Oturumlar

```ts
import { test, defineSession } from '@testfly/playwright';

defineSession('admin', async (page) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel('Password').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
});

test('admin paneli', async ({ page, session }) => {
  await session.as('admin'); // storage state bir kez oluşturulur ve .testfly/sessions altında önbelleğe alınır
  await page.goto('/admin');
});
```

---

## Self-healing locator'lar

`locate(key)` şu sırayla çözümlenir:

1. YAML'daki birincil tanım,
2. YAML `fallbacks` listesi,
3. kayıtlı healing stratejileri, artan önceliğe göre: rules (10), fuzzy (20), AI (100; yalnızca `healing.mode: 'ai'` ve `@testfly/ai` kuruluysa).

Her başarılı iyileştirme teste eklenir ve reporter'da gösterilir. Herhangi bir iyileştirme olduğunda koşumu düşürmek için `testfly.reporter.qualityGate.failOnHeal` kullanın. Özel stratejiler `registerHealingStrategy` ile eklenebilir.

---

## Reporter ve stabilite analitiği

`@testfly/reporter`, `defineConfig` tarafından otomatik eklenir (veya herhangi bir Playwright projesinde kullanılabilir). Koşumdan sonra `.testfly/report/index.html` dosyasını açın (`npx testfly report`). Sundukları:

- koşum geçmişi (`.testfly/history/run-*.v1.json`) ve **Flakiness Radar** (`STABLE` / `WATCH` / `HIGH`),
- **kural tabanlı hata sınıflandırma** (`SYSTEM_FLAKY`, `TEST_BUG`, `APPLICATION_BUG`, `NEEDS_INVESTIGATION`); sıfır token, LLM yok,
- `testfly-quarantine.yml` ile **karantina** (testler atlanır ve işaretlenir),
- **kalite kapıları** (`minPassRate`, `maxFlaky`, `failOnHighFlakiness`, `failOnHeal`),
- geçmişe dayalı **süre dengeli sharding** (`npx testfly shard --total 4 --index 1`).

LLM tabanlı kök neden analizi ayrı ve isteğe bağlı olarak `@testfly/ai/reporter` reporter'ı ile sağlanır (`.testfly/report/ai-analysis.json` yazar). Bkz. [`packages/ai/README.md`](./packages/ai/README.md).

---

## CLI

`testfly` komutu `@testfly/playwright` ile gelir.

| Komut | Açıklama |
| :--- | :--- |
| `testfly init [--force] [--no-bdd]` | Config, örnek testler, locator'lar ve `.gitignore` girdilerini oluşturur. |
| `testfly doctor` | Node, Playwright, config, locator'lar ve BDD step'lerini kontrol eder. |
| `testfly locators [-d <dir>] [-o <file>]` | Tipli locator anahtarlarını üretir (`locators/index.d.ts`). |
| `testfly steps [--scaffold] [-f <features>] [-t <steps>]` | Tanımı olmayan feature step'lerini listeler; `--scaffold` taslakları `steps/unmapped.steps.ts` dosyasına yazar. |
| `testfly generate --swagger <pathOrUrl> [-o <dir>]` | OpenAPI/Swagger dokümanından BDD feature'ları ve API step'leri üretir. |
| `testfly test [args...]` | `bddgen` (BDD yapılandırılmışsa) ve `playwright test` çalıştırır. Seçenekler: `--clean`, `--ui`, `--headed`, `-p`, `-g`, `-r`, `-c`, `-w`, `--no-bdd`; ek argümanlar aynen iletilir. |
| `testfly clean [--all]` | `.features-gen`, `test-results` ve raporları siler; `--all` koşum geçmişini de siler. |
| `testfly shard --total <n> --index <i>` | Süre dengeli bir shard'ın dosyalarını yazdırır (`--format files\|json`). |
| `testfly quarantine list [-f <file>]` | Aktif ve süresi dolmuş karantina girdilerini listeler. |
| `testfly report [html] [-o <dir>]` | TestFly dashboard'unu veya `html` ile Playwright HTML raporunu açar. |
| `testfly ci [github\|gitlab] [--pm <pm>] [--shards <n>] [--force]` | CI pipeline dosyası yazar. |

---

## Mobil

`@testfly/mobile`, [Mobilewright](https://mobilewright.dev) üzerinde **deneysel** native iOS/Android testi ekler. Mobilewright simülatörleri, emülatörleri ve gerçek cihazları mobilecli ile sürer (Appium yok). Paket private'tır, yayınlanmaz ve desteklenen API kapsamında değildir. `mobilewright` opsiyonel bir peer bağımlılıktır.

```ts
// playwright.config.ts → testfly
mobile: { platform: 'ios', bundleId: 'com.example.app' },
```

```ts
import { test, expect } from '@testfly/mobile';

test('giriş', async ({ mobileLocate }) => {
  await mobileLocate('login.username').fill('ada');   // YAML'daki ios:/android:/mobile: bloğu
  await mobileLocate('login.signIn').tap();
  await expect(mobileLocate('home.greeting')).toHaveText('Hello, ada');
});
```

BDD adımları `@testfly/mobile/bdd` içinden import edilir (`testfly.bdd.importTestFrom: '@testfly/mobile/bdd'`). Ayrıntılar: [`packages/mobile/README.md`](./packages/mobile/README.md), [ADR-002](./docs/adr/ADR-002.md).

---

## Geliştirme

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

Node.js >= 22 ve pnpm 10 gerektirir.

## Dokümantasyon

- [ADR-001: temel kararlar](./docs/adr/ADR-001.md)
- [ADR-002: Mobilewright üzerinde native mobil test](./docs/adr/ADR-002.md)
- [Mimari (`ARCHITECTURE.md`)](./ARCHITECTURE.md)
- [MVP spesifikasyonu (`MVP_SPEC.md`)](./MVP_SPEC.md)
- [Yol haritası (`ROADMAP.md`)](./ROADMAP.md)

## Lisans

Apache-2.0
