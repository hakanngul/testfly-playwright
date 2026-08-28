@ui @locators
Feature: SauceDemo Login and Product Catalog with YAML Locators

  Scenario: User logs in and verifies product catalog using YAML element repository
    Given the user navigates to the login page
    When the user enters username "standard_user" and password "secret_sauce"
    And clicks the login button
    Then the product catalog title should be "Products"
    And at least 1 product item should be displayed
