@parity @matchers
Feature: Form and page assertions ported from TestFly

  Background:
    Given a sign-up form with an email, a password and a country select

  Scenario: HTML5 validation state is asserted with web-first matchers
    When the user types "not-an-email" into the email field
    Then the email field is invalid with a validation message
    And the email field is required with a max length of 40
    When the user types "ada@example.com" into the email field
    Then the email field is valid

  Scenario: Password visibility toggle
    Then the password is hidden
    When the user clicks "Show password"
    Then the password is visible

  Scenario: Selected option, count bounds and storage
    When the user selects "Germany" as country
    Then the selected country is "Germany"
    And the form has at least 3 and at most 3 inputs
    When the page stores "theme" = "dark" in localStorage
    Then localStorage item "theme" is "dark"
    And the page has 1 open window
