Feature: TestFly Playwright Demo Akışı

  Scenario: Kullanıcı yapılacaklar listesine yeni görev ekler
    Given kullanıcı todo sayfasına gider
    When kullanıcı "TestFly ile test yaz" görevini ekler
    Then listede "TestFly ile test yaz" görevi görüntülenir
    And sistemde "TODO_CREATED" durumunda bir kayıt oluşur
