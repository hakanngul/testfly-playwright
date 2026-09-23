Feature: İleri Seviye API ve Web Otomasyon Yetenekleri (Ponytail Edition)

  @api @graphql @sla
  Scenario: GraphQL sorgusu çalıştırma, SLA süresi ve otomatik rapor eki
    When "https://countries.trevorblades.com" adresine GraphQL sorgusu gönderilir:
      """
      query { country(code: "TR") { name capital } }
      """
    Then API yanıt süresi 2500 ms altında olmalıdır
    And GraphQL yanıtında ülke adı "Turkey" olmalıdır
    And API istek ve yanıt detayları otomatik rapora eklenmiş olmalıdır

  @data-driven @api
  Scenario: JSON dosyasından test verisi besleme
    Given "data/users.json" dosyasından test verisi yüklenir
    When ilk veri satırındaki kullanıcı için sorgu yapılır
    Then kullanıcı verisinin doğruluğu onaylanır

  @web @smart-form @self-healing
  Scenario: Akıllı form doldurma ve self-healing seçici fallback
    Given kullanıcı kayıt formunu açar
    When akıllı form yardımcısı ile alanlar tek seferde doldurulur:
      | username | testuser          |
      | email    | test@testfly.dev  |
    And kırık birincil seçici tanımlı "fallbacks" listesi üzerinden kurtarılır
    Then form başarıyla gönderilir
