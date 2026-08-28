@quality @a11y @visual
Feature: Accessibility (WCAG 2.1 AA) and Visual Snapshot Quality Gates

  Scenario: Audit web application for accessibility violations and visual regressions
    Given the user navigates to the application landing page
    When an automated Axe accessibility audit is performed for "wcag2a,wcag2aa"
    Then there should be 0 accessibility violations
    And the page layout should match the visual snapshot "homepage-layout"
