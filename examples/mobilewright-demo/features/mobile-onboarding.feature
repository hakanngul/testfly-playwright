@mobile @ios @android
Feature: Mobile App Onboarding Flow

  Scenario: User swipes through onboarding cards and taps get started
    Given the mobile application is launched
    When the user swipes "left" on the onboarding carousel
    And taps the "Get Started" button
    Then the login bottom sheet should be displayed
