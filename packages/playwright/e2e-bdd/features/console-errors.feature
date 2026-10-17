@parity @console
Feature: Browser console errors are collected per test

  Scenario: Uncaught exceptions and console.error calls are recorded
    When a page logs "boom" with console.error and throws "kaboom"
    Then 2 browser errors are recorded
    And one of them is the uncaught exception "kaboom"

  Scenario: Expected errors can be cleared
    When a page logs "known noise" with console.error and throws "expected failure"
    And the recorded browser errors are cleared
    Then no browser errors are recorded
