@quality @performance @vitals
Feature: Core Web Vitals Performance Budget Quality Gate

  Scenario: Measure and enforce Core Web Vitals thresholds
    Given the user navigates to the application landing page
    When performance metrics are collected from the browser
    Then the Largest Contentful Paint should be under 2500 ms
    And the Cumulative Layout Shift should be under 0.1
    And the Time to First Byte should be under 800 ms
