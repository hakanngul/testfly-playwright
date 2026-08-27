Feature: SauceDemo UI Test Otomasyon Akışları

  Background:
    Given kullanıcı SauceDemo ana sayfasına gider

  @ui @smoke
  Scenario: Başarılı kullanıcı girişi ve ürün kataloğu görüntüleme
    When kullanıcı "standard_user" ve "secret_sauce" bilgileriyle giriş yapar
    Then ürünler sayfasının başarıyla yüklendiği doğrulanır

  @ui @negative
  Scenario: Kilitli kullanıcı ile sisteme giriş denemesi
    When kullanıcı "locked_out_user" ve "secret_sauce" bilgileriyle giriş yapar
    Then ekranda "Sorry, this user has been locked out" hata mesajı görüntülenir

  @ui @negative
  Scenario: Kullanıcı adı ve şifre girilmeden boş form gönderimi
    When kullanıcı giriş butonuna tıklar
    Then ekranda "Username is required" hata mesajı görüntülenir

  @ui @sorting
  Scenario: Ürünlerin fiyata göre düşükten yükseğe sıralanması
    Given kullanıcı "standard_user" ve "secret_sauce" bilgileriyle giriş yapar
    When kullanıcı ürünleri "lohi" seçeneği ile sıralar
    Then ürün fiyatlarının artan sırada listelendiği doğrulanır

  @ui @e2e
  Scenario: Ürünleri sepete ekleme ve siparişi başarıyla tamamlama E2E
    Given kullanıcı "standard_user" ve "secret_sauce" bilgileriyle giriş yapar
    When kullanıcı "Sauce Labs Backpack" ürününü sepete ekler
    And kullanıcı "Sauce Labs Bike Light" ürününü sepete ekler
    And kullanıcı sepet sayfasına gider
    And kullanıcı ödeme adımına ilerler
    And kullanıcı müşteri bilgilerini "Ahmet", "Yılmaz", "34000" olarak girer
    And kullanıcı siparişi onaylar ve tamamlar
    Then ekranda "Thank you for your order!" mesajı doğrulanır

  @ui @cart
  Scenario: Sepete eklenen ürünün sepetten çıkarılması ve rozet kontrolü
    Given kullanıcı "standard_user" ve "secret_sauce" bilgileriyle giriş yapar
    When kullanıcı "Sauce Labs Backpack" ürününü sepete ekler
    And kullanıcı sepet sayfasına gider
    And kullanıcı "Sauce Labs Backpack" ürününü sepetten çıkarır
    Then sepetteki ürün sayısının sıfırlandığı doğrulanır
