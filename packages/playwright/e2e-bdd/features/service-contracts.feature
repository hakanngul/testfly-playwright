@parity @api @wave2
Feature: Service contracts against a stubbed downstream service

  Background:
    Given a stubbed user service

  Scenario: The client calls the service and the response honours the OpenAPI contract
    When the client fetches user 7
    Then the response matches the OpenAPI contract
    And the response matches the user JSON Schema
    And the service received exactly 1 request for user 7

  Scenario: A contract violation is reported with its JSON path
    Given the service returns a user with an unknown role
    When the client fetches user 7
    Then the OpenAPI check fails mentioning "$.role"

  Scenario: Several users are fetched in one batch with a correlation id
    When the client fetches users 1, 2 and 3 in a batch with correlation id "run-42"
    Then all 3 batch requests succeed
    And every request to the service carried correlation id "run-42"
