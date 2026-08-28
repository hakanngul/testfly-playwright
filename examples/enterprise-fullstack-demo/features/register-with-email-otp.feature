@e2e @omnichannel @api @db @mail
Feature: Omnichannel Full-Stack User Onboarding & Email OTP Verification

  Scenario: Create user via API, verify Redis cache, capture OTP email, and verify on UI
    Given a new user is registered via API with email "enterprise.user@testfly.dev"
    When the temporary authentication token is verified in Redis cache
    And the activation email is received with a 6-digit OTP code
    Then the user enters the OTP code on the verification UI
    And the user status in database should be "ACTIVE"
