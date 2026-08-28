@mobile @gestures
Feature: Mobile Touch Gestures and Interactions

  Scenario: User performs long press and double tap gestures
    Given the mobile application is launched
    When the user long presses the "Get Started" button for 1500 ms
    Then the action should complete successfully
