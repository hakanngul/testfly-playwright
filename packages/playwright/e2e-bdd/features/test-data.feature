@parity @data @wave2
Feature: Excel test data and the worker-scoped suite context

  Scenario: Accounts are read from an Excel worksheet
    Given an Excel workbook with an "accounts" sheet
    When the "accounts" sheet is loaded
    Then 2 accounts are available
    And the second account's email is "bob@example.com"

  Scenario: Values stored in the suite context are visible to later scenarios of the worker
    When the suite context stores "region" = "eu-central"
    Then the suite context value "region" is "eu-central"
