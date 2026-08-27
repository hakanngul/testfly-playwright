Feature: Platzi Fake Store REST API Test Akışları

  @api @smoke
  Scenario: Tüm ürünlerin listesini çekme ve şema doğrulama
    When Platzi API üzerinden tüm ürünler listesi istenir
    Then API yanıt durum kodu 200 olmalıdır
    And gelen yanıtın ürün dizisi olduğu ve zorunlu alanları içerdiği doğrulanır

  @api @filtering
  Scenario: Ürünleri sayfalama ve fiyat aralığına göre filtreleme
    When Platzi API'den "5" adet ürün için "20" ile "100" fiyat aralığında filtreleme yapılır
    Then API yanıt durum kodu 200 olmalıdır
    And dönen ürün sayısının en fazla "5" olduğu ve fiyatların limitler dahilinde olduğu doğrulanır

  @api @crud
  Scenario: Yeni ürün oluşturma ve detaylarını doğrulama
    When Platzi API'ye yeni bir ürün oluşturma isteği gönderilir
    Then API yanıt durum kodu 201 olmalıdır
    And oluşturulan ürünün id ve başlık bilgisi doğrulanır

  @api @auth
  Scenario: Kullanıcı girişi ile JWT token alma ve profil sorgulama
    When kullanıcı "john@mail.com" ve "changeme" bilgileriyle API üzerinden giriş yapar
    Then API yanıtında geçerli bir JWT access_token dönmelidir
    And bu token ile kullanıcı profili çekildiğinde e-posta adresi "john@mail.com" olmalıdır
