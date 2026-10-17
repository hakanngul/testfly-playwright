@parity @api
Feature: Semantic JSON assertions on API responses

  Background:
    Given a local API that returns the current user

  Scenario: Whole-body equality ignores key order and, optionally, array order
    When the client requests "/me"
    Then the status is between 200 and 299
    And the body equals the expected user ignoring array order
    And the "$.roles" array contains "admin"

  Scenario: A mismatch names the first difference
    When the client requests "/me"
    Then comparing the body with a user named "Bob" fails at "$.name"
