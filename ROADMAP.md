# TestFly Playwright — Geliştirme Yol Haritası (`ROADMAP.md`)

Bu doküman TestFly'ın fazlarını ve kilometre taşlarını içerir. İşaretler depodaki **mevcut koda** göre güncellenmiştir. `[~]` kısmen tamamlanmış maddeleri gösterir. Kararlar: [`docs/adr/ADR-001.md`](./docs/adr/ADR-001.md).

---

## Faz 1: Temel Mimari & MVP
> **Hedef:** Sıfır konfigürasyonlu BDD, genişletilmiş fixture'lar ve temel CLI başlatıcı.

- [x] Monorepo ve paket iskeletinin kurulması (`pnpm` workspace, `tsup`, `typescript`, changesets).
- [x] Birleştirilebilir fixture setleri (`coreTest`, `apiTest`, `dataTest`, `locatorTest`, `qualityTest`, `mockTest`, `sessionTest`, `quarantineTest`) ve bunları `mergeTests` ile birleştiren varsayılan `test`.
- [x] `playwright-bdd` sarmalayıcısı: `Given/When/Then` `@testfly/playwright/bdd` giriş noktasından hazır export ediliyor.
- [x] Akıcı `api` fixture'ı (yeniden deneme, auth yardımcıları, `graphql`, `pollUntil`, yanıt doğrulamaları).
- [x] `step` (timeline step logger) fixture'ı. Adımlar reporter'a attachment olarak akıyor.
- [x] Zod şeması ve `defineConfig` (`@testfly/playwright/config`). Seçenekler `playwright.config.ts` içindeki `testfly` anahtarında; ayrı `testfly.config.ts` / `defineTestFlyConfig` yok.
- [x] `testfly init` CLI komutu ve `create-testfly` iskelet oluşturucu.
- [x] Tipli YAML locator'lar (`testfly locators` → `index.d.ts`) ve kural/fuzzy tabanlı self-healing.
- [~] Çalışır demo/starter projeler: `create-testfly` şablonları güncel; `examples/` altındaki demolar hâlâ eski API'yi (`defineTestFlyConfig`, kök `Given/When/Then`) kullanıyor.

---

## Faz 2: Veri, Auth & İzolasyon
> **Hedef:** Kurumsal test ihtiyaçları için DB, mail ve oturum yönetimi.

- [x] **`session` fixture'ı:** `defineSession(role, setup)` + `session.as(role)`; rol başına storage state `.testfly/sessions` altında önbelleğe alınır ve worker'lar arası kilitle korunur.
- [~] **`db` fixture'ı:** PostgreSQL (`pg`), MySQL (`mysql2`) ve açık `mock` için sorgu, transaction, `expectRow`/`expectNoRow`/`expectValue`, `waitFor`. Ayrıca `redis` fixture'ı. *MongoDB desteklenmiyor; seed yardımcısı yok.*
- [x] **`mail` fixture'ı:** Mailpit, Mailtrap, IMAP ve açık `mock` sağlayıcıları; `waitForEmail`, `extractCode`, `extractLinks`.
- [~] **Data-driven testler:** `ctx.loadJson` / `ctx.loadCsv` / `ctx.load` ile JSON/CSV yükleme ve `{{key}}` interpolasyonu mevcut. BDD tarafında Gherkin `Scenario Outline` kullanılabilir; harici CSV/JSON'dan senaryo çoğaltma henüz yok.

---

## Faz 3: Enterprise Entegrasyonlar & AI
> **Hedef:** Stabilite analitiği, CI entegrasyonu ve AI destekli yardımcılar.

- [x] **Kural tabanlı hata sınıflandırma (triage):** `@testfly/reporter` başarısız testleri sıralı bir kural tablosuyla (`TRIAGE_RULES`, LLM yok, sıfır token) `SYSTEM_FLAKY`, `TEST_BUG`, `APPLICATION_BUG`, `NEEDS_INVESTIGATION` olarak sınıflandırıyor; dashboard'da gösteriliyor.
- [~] **LLM destekli hata analizi:** opt-in `@testfly/ai/reporter` başarısız testler için LLM'den (Anthropic / OpenAI / Gemini / OpenAI uyumlu) kök neden analizi alıp `.testfly/report/ai-analysis.json` dosyasına yazıyor; analiz run kaydına ve TestFly dashboard'una gömülüyor. *Planlanan: LLM tabanlı triage sınıflandırması; trace/screenshot verisinin modele gönderilmesi şu an yok (yalnızca hata mesajı, kod parçası, adımlar ve URL).*
- [x] **Self-healing locator:** YAML `fallbacks` → rules → fuzzy → (opsiyonel) AI stratejisi; heal olayları raporlanıyor, `qualityGate.failOnHeal` ile koşum düşürülebiliyor.
- [x] **Flakiness Radar, karantina, kalite kapısı ve LPT sharding** (`@testfly/reporter`, `testfly shard`, `testfly quarantine list`).
- [x] **CI şablonları:** `testfly ci github|gitlab` (GitHub için shard desteğiyle).
- [x] **AI katmanı:** `ai.act()`, `ai.byIntent()`, `toSatisfyAi`/`toViolateAi`, live/replay/off cache modları (`@testfly/ai`).
- [x] **Slack, Teams & Discord bildirimleri:** `@testfly/reporter` koşum sonunda `testfly.reporter.notifications` ile tanımlı webhook'lara mesaj gönderiyor (varsayılan: yalnızca başarısız koşumlarda).
- [x] **TestFly (Java) paritesi, dalga 1:** ek `expect` matcher'ları (form doğrulama, şifre görünürlüğü, sayı sınırları, cookie/localStorage/pencere sayısı), `consoleErrors` fixture'ı, API anlamsal JSON yardımcıları, run başına `heal-log.json`, `features` aç/kapa paneli.
- [x] **TestFly (Java) paritesi, dalga 2:** `api.batch` / `withInterceptor` / `saveTo` + charset, `expectJsonSchema` / `expectOpenApi` (opsiyonel `ajv`), `ctx.loadExcel` (opsiyonel `exceljs`) ve worker kapsamlı `suiteCtx`, sayfasız `mockServer` fixture'ı, TestRail + Xray Cloud senkronu, `@testfly/ai/reporter` `patches` (Auto-PR).
- [x] **Yük testi:** k6 sarmalayıcısı: `load` fixture'ı (`load.run({ url, vus, duration, thresholds })`, mevcut betikler için `script`), kullanıcının kurduğu k6 ile.
- [x] **TestRail & Xray senkronizasyonu:** `testfly.reporter.testManagement` (TestRail `@C1234`, Xray Cloud `@PROJ-123` etiketleriyle).

---

## Faz 4: Dokümantasyon, Yayın & Topluluk (v1.0.0)
> **Hedef:** Açık kaynak lansmanı, npm yayını ve portföy vitrini.

- [ ] `@testfly/playwright`, `@testfly/reporter`, `@testfly/ai`, `create-testfly` paketlerinin npm'e yayınlanması (changesets yapılandırıldı, yayın workflow'u yok).
- [~] Paket README'leri ve ADR-001 depoda; dokümantasyon sitesi (`testfly.dev`) henüz yok.
- [ ] GitHub'da hazır çalıştırılabilir şablon repo (`testfly-playwright-starter`).
- [ ] Lansman makaleleri (LinkedIn, Medium, X).

---

## 1.0 Sonrası

- [~] `@testfly/mobile`: Mobilewright (mobilecli) üzerinde native iOS/Android desteği ([ADR-002](./docs/adr/ADR-002.md)). Fixture'lar, YAML platform blokları ve BDD girişi hazır; sahte sürücüyle test ediliyor. Gerçek cihaz/simülatör CI'ı ve npm yayını yok, paket deneysel ve private.
- [x] Locator YAML'ında `ios`/`android`/`mobile` platform blokları (`mobileLocate` kullanır).
