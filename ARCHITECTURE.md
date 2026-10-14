# TestFly Playwright — Mimari Tasarım (`ARCHITECTURE.md`)

Bu doküman TestFly monorepo'sunun paketlerini, katmanlarını ve iç çalışma prensiplerini anlatır. Kararların gerekçeleri [`docs/adr/ADR-001.md`](./docs/adr/ADR-001.md) dosyasındadır.

---

## 1. Temel Tasarım İlkeleri

1. **Native Playwright:** Her özellik bir Playwright fixture'ı (`test.extend`) veya config yardımcısıdır. BDD senaryoları `playwright-bdd` ile standart Playwright testlerine derlenir ve `@playwright/test` runner'ında koşar.
2. **Config Playwright config'inde (ADR-001 D2):** `defineConfig({ testfly: {...} })` zod ile doğrulanır. Sonuç testlere worker kapsamlı `testfly` fixture'ı ile ulaşır. Global singleton ve ayrı `testfly.config.ts` dosyası yoktur.
3. **Birleştirilebilir fixture setleri:** Her yetenek ayrı bir `test.extend` setidir. Varsayılan `test` hepsini `mergeTests` ile birleştirir.
4. **Tek veri sözleşmesi (D4):** Worker'lar reporter'a yalnızca sürümlü attachment'lar gönderir (`@testfly/reporter/schema`).
5. **Katmanlı self-healing (D5):** YAML birincil tanım → YAML `fallbacks` → öncelik sırasına göre stratejiler (rules → fuzzy → ai).
6. **Dürüstlük ilkesi (D7):** Her hata kodlu bir `TestFlyError`'dır. Sessiz sahte veri ve sessiz başarı yoktur.

---

## 2. Paketler ve Bağımlılık Yönü

```
create-testfly        (bağımsız iskelet oluşturucu)

@testfly/ai  ──peer──▶ @testfly/playwright ──dep──▶ @testfly/reporter
     └────────────────────dep──────────────────────────────▲

@testfly/mobile       (deneysel, private, yayınlanmaz; sürücüsü yok)
```

| Paket | Giriş noktaları (`exports`) | Sorumluluk |
| --- | --- | --- |
| `@testfly/playwright` | `.`, `./bdd`, `./config`, `./locators`, `./db`, `./mail`; bin: `testfly` | Fixture'lar, config, locator'lar ve healing, istemciler (API/DB/Redis/mail/mock/faker/session), kalite (a11y/visual/perf/form), CLI |
| `@testfly/reporter` | `.`, `./schema` | Veri sözleşmesi, Playwright reporter'ı, geçmiş, Flakiness Radar, kural tabanlı triage, karantina, kalite kapısı, LPT sharder, dashboard |
| `@testfly/ai` | `.`, `./reporter` | `ai` fixture'ı (`act`, `byIntent`, `assert`), `toSatisfyAi`/`toViolateAi`, AI healing stratejisi, opsiyonel LLM hata analizi reporter'ı, cache/replay |
| `create-testfly` | bin: `create-testfly` | `npm create testfly@latest <dizin> [--bdd]` |

---

## 3. Katmanlar

### Katman 1: Public API

```ts
// Spec testleri
import { test, expect, mergeTests, defineSession, TestFlyError } from '@testfly/playwright';

// BDD step tanımları (playwright-bdd base'i + tüm TestFly fixture'ları)
import { Given, When, Then, Before, After, expect } from '@testfly/playwright/bdd';

// Config
import { defineConfig } from '@testfly/playwright/config';
```

`@testfly/playwright/bdd` içinde `test = mergeTests(bddBase, testflyTest)` oluşturulur ve `Given/When/Then/...` bu `test`'e `createBdd` ile bağlanır. `defineConfig`, `testfly.bdd` tanımlıysa `defineBddConfig({ importTestFrom: '@testfly/playwright/bdd' })` çağırır. Böylece kullanıcı `createBdd` çağırmaz.

### Katman 2: Fixture Motoru (`packages/playwright/src/fixtures`)

| Set | Fixture'lar | Kapsam |
| --- | --- | --- |
| `coreTest` | `testfly` (option), `ctx`, `step`, `faker` | worker / test |
| `apiTest` | `api` | test |
| `dataTest` | `db`, `redis`, `mail` | worker (lazy; config yoksa `TF_*_NOT_CONFIGURED`) |
| `locatorTest` | `locators` (registry), `locate` | worker / test |
| `qualityTest` | `a11y`, `visual`, `perf`, `form` | test |
| `mockTest` | `mock` | test |
| `sessionTest` | `session` | test |
| `quarantineTest` | `_quarantineGuard` (auto) | test |

```ts
// packages/playwright/src/fixtures/index.ts (özet)
export const test = mergeTests(coreTest, apiTest, dataTest, locatorTest, qualityTest, mockTest, sessionTest, quarantineTest);
```

### Katman 3: Konfigürasyon Motoru (`packages/playwright/src/core/config`)

- `schema.ts`: `TestFlyOptionsSchema` (zod v4). Anahtarlar: `baseUrl`, `env`, `timeouts`, `api`, `db`, `redis`, `mail`, `session`, `locators`, `healing`, `ai`, `bdd`, `reporter`, `profiles`, `custom`.
- `parse.ts`: `${VAR}` çözümü (`process.env` + `.env`), `TESTFLY_ENV`/`env` profil birleştirme, doğrulama (`TF_CONFIG_INVALID`).
- `define.ts`: `defineConfig`. Kök ve proje bazlı `use.testfly` seçeneklerini çözer, `use.baseURL` atar, BDD'yi ve `@testfly/reporter`'ı bağlar.

### Katman 4: Locator'lar ve Healing (`packages/playwright/src/locators`)

- **Format:** `locators/<sayfa>.yaml`. Dosya adı sayfa adıdır, üst düzey anahtarlar locator'lardır (`LocatorParser.parseFile`). Anahtar: `<sayfa>.<isim>`.
- **Doğrulama:** `schema.ts` (`normalizeDef`). Tanım başına tek seçici alanı (`role`, `label`, `text`, `testid`, `placeholder`, `alt`, `title`, `css`, `xpath`) ve değiştiriciler (`nth`, `first`, `last`, `has_text`, `within`, `fallbacks`). Düz string CSS'tir. `web:` takma addır, `ios/android/mobile` yok sayılır.
- **TypeGen:** `testfly locators` → `locators/index.d.ts` (`LocatorTypeGen`). Global `TestFly.LocatorMap` arayüzünü genişletir.
- **Healing:** `healing/runner.ts`. Sırası: YAML fallbacks → `RulesStrategy` (10) → `FuzzyStrategy` (20) → AI (100, `healing.mode: 'ai'` ise `@testfly/ai` lazy import edilir). Her iyileştirme `application/vnd.testfly.heal+json` olarak eklenir.

### Katman 5: İstemciler ve Kalite (`clients/`, `quality/`)

- `clients/api`: `ApiClient` (yeniden deneme, `withBearer`/`withBasic`/`withAuth`, `graphql`, `pollUntil`, cURL logu; digest/HMAC/OAuth2/API key strateji fabrikaları `clients/api/auth` altında mevcut ancak henüz paket giriş noktalarından export edilmiyor), `ApiResponse` (`expectStatus`, `expectJson`, `expectSchema`, `jsonPath`, `expectDurationBelow`).
- `clients/db`: `DbClient` (postgres/mysql/mock), `RedisClient` (ioredis/mock). Sürücüler opsiyonel peer bağımlılıklarıdır.
- `clients/mail`: `MailClient` (mailpit, mailtrap, imap, mock), `extractCode`, `extractLinks`.
- `clients/mock`: `MockClient` (route mock, `expectRequest`). `clients/auth`: `SessionManager`, `defineSession`. `clients/faker`: `FakerClient`.
- `quality`: `A11yClient` (axe-core), `VisualClient` (`assertSnapshot`, `assertElementSnapshot`), `PerformanceClient` (`getVitals`, `assertLcp`, `assertCls`, `assertTtfb`), `FormClient` (`fill`).

### Katman 6: Raporlama (`packages/reporter`)

```
worker (testInfo.attach, vnd.testfly.*+json)
   │
   ▼
TestFlyReporter ──▶ .testfly/history/run-<ts>-<shard>.v1.json
   │                    │
   │                    ├─▶ computeFlakiness (Flakiness Radar)
   │                    ├─▶ triageFailure (kural tablosu, LLM yok)
   │                    ├─▶ evaluateGate (kalite kapısı)
   │                    └─▶ planShards (LPT, `testfly shard`)
   ▼
.testfly/report/{index.html, summary.json, flakiness.json}
```

LLM tabanlı kök neden analizi ayrıdır: `@testfly/ai/reporter`, `.testfly/report/ai-analysis.json` yazar.

### Katman 7: CLI (`packages/playwright/src/cli`)

Komutlar: `init`, `doctor`, `locators`, `steps`, `generate --swagger`, `clean`, `test`, `shard`, `quarantine list`, `report [html]`, `ci [github|gitlab]`. Komut implementasyonları lazy yüklenir.

---

## 4. Dizin Yapısı

```
testfly-playwright/
├── package.json               # workspace script'leri: build, typecheck, test, lint:package, changeset
├── pnpm-workspace.yaml        # packages/*
├── tsconfig.base.json
├── .changeset/
├── docs/adr/ADR-001.md
├── examples/                  # demo projeler
└── packages/
    ├── playwright/            # @testfly/playwright
    │   ├── bin/testfly.js
    │   ├── src/
    │   │   ├── index.ts       # ana giriş
    │   │   ├── entries/       # bdd, config, locators, db, mail alt giriş noktaları
    │   │   ├── core/          # config, context (TestContext), steps (StepLogger), errors
    │   │   ├── fixtures/      # core, api, data, locators, quality, mock, session, quarantine
    │   │   ├── clients/       # api, auth, db, faker, mail, mock
    │   │   ├── locators/      # parser, schema, registry, typegen, healing/
    │   │   ├── quality/       # a11y, visual, performance, form
    │   │   └── cli/           # testfly komutları
    │   ├── test/              # vitest birim/entegrasyon testleri
    │   └── e2e/               # gerçek Playwright koşumları
    ├── reporter/              # @testfly/reporter
    ├── ai/                    # @testfly/ai
    ├── create-testfly/        # create-testfly (src/ + templates/base, templates/bdd)
    └── mobile/                # @testfly/mobile (deneysel, private)
```

Kütüphane paketleri (`@testfly/playwright`, `@testfly/reporter`, `@testfly/ai`) `tsup` ile ESM + CJS ve `.d.ts` üretir; `create-testfly` yalnızca ESM bir CLI'dır. Tüm paketler Node.js >= 22 gerektirir.
