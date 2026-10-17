@mobile
Feature: Native app login with YAML locators

  Background:
    Given the app shows the login screen

  Scenario: Signing in shows the home screen
    When I sign in as "ada"
    Then "home.greeting" shows "Hello, ada"
    And "home.orders" is visible
    And "home.settings" shows "Settings"

  Scenario: The sign-in button waits for a username
    Then the sign-in button is disabled
    When I type "grace" into "login.username"
    Then "login.username" has the value "grace"

  Scenario Outline: Any user can sign in
    When I sign in as "<user>"
    Then "home.greeting" shows "Hello, <user>"

    Examples:
      | user    |
      | linus   |
      | barbara |
