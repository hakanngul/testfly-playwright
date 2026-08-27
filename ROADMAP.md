# TestFly Playwright — Geliştirme Yol Haritası (`ROADMAP.md`)

Bu doküman, TestFly Playwright projesinin fazlarını, kilometre taşlarını ve yayınlama planını içerir.

---

## 📍 Faz 1: Temel Mimari & MVP (v0.1.0)
> **Hedef:** Sıfır konfigürasyonlu BDD, genişletilmiş fixture'lar ve temel CLI başlatıcı.

- [ ] Monorepo & paket iskeletinin kurulması (`pnpm`, `tsup`, `typescript`).
- [ ] `fixtures/index.ts` üzerinde TestFly context (`test.extend`) oluşturulması.
- [ ] `playwright-bdd` sarmalayıcısının yazılması (`Given, When, Then` doğrudan export).
- [ ] Fluent `api` fixture'ının geliştirilmesi.
- [ ] `step` (Timeline Step Logger) fixture'ının geliştirilmesi.
- [ ] `testfly.config.ts` Zod şemasının ve `defineTestFlyConfig` fonksiyonunun yazılması.
- [ ] `npx testfly init` CLI komutunun kodlanması.
- [ ] Çalışır durumda bir demo/starter projesinin eklenmesi.

---

## 📍 Faz 2: Veri, Auth & İzolasyon (v0.2.0)
> **Hedef:** Kurumsal test ihtiyaçları için DB, Mail ve oturum yönetimi.

- [ ] **`auth` Fixture:** Testler öncesi kullanıcı oturumunu (`storageState.json`) önbelleğe alan ve yeniden kullanan mekanizma.
- [ ] **`db` Fixture:** PostgreSQL, MySQL ve MongoDB için sorgu, tohumlama (seed) ve satır doğrulama yardımcıları.
- [ ] **`mail` Fixture:** Mailtrap, Mailpit ve IMAP posta kutularından gelen doğrulama kodlarını/linklerini yakalama desteği.
- [ ] **Data-Driven BDD:** CSV ve JSON kaynaklarından senaryo verilerini çoklama desteği.

---

## 📍 Faz 3: Enterprise Entegrasyonlar & AI (v0.3.0)
> **Hedef:** Test yönetimi, CI bildirimleri ve AI destekli hata analizi.

- [ ] **AI Failure Triage Reporter:** Test patladığında hata mesajını ve Playwright trace/screenshot verisini LLM'e (Gemini / Claude / OpenAI) göndererek kök neden analizi sunan custom reporter.
- [ ] **TestRail & Xray Sync:** Koşulan test sonuçlarını otomatik olarak TestRail veya Jira Xray test planlarına push eden adapter.
- [ ] **Slack & Teams Bildiricisi:** Test koşum özetini, başarısızlık grafiklerini ve doğrudan HTML rapor linkini Slack/Teams kanallarına gönderen webhook eklentisi.
- [ ] **Self-Healing Locator Plugin:** Kırılan locator'lar için alternatif Playwright locator fallback stratejisi.

---

## 📍 Faz 4: Dokümantasyon, Yayın & Topluluk (v1.0.0)
> **Hedef:** Açık kaynak lansmanı, npm yayını ve portföy vitrini.

- [ ] `@testfly/playwright` adıyla npm registry'e yayınlama.
- [ ] Mevcut Docusaurus dokümantasyon sitesine (`docs-site`) **Playwright** bölümünün ve rehberlerinin eklenmesi.
- [ ] GitHub'da hazır çalıştırılabilir şablon repo (`testfly-playwright-starter`) oluşturulması.
- [ ] LinkedIn, Medium ve Twitter/X için mimari teknik lansman makalesi.
