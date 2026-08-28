// Core & BDD
export * from './core';
export { test, expect } from './fixtures';
export type { TestFlyFixtures } from './fixtures';

// Config
export { defineTestFlyConfig, getTestFlyConfig, setTestFlyConfig, loadTestFlyConfigSync } from './core/config';
export type {
  TestFlyConfig,
  TestFlyConfigInput,
  DatabaseConfigSchema,
  MailConfigSchema,
  AuthConfigSchema,
  TimeoutsConfigSchema,
  ReportingConfigSchema,
  TestFlyConfigSchema,
} from './core/config';

// Clients & Engines
export { ApiClient } from './clients/api/ApiClient';
export type { ApiResponse, ApiRequestOptions, ApiAuthManager } from './clients/api/types';
export { DbClient } from './clients/db/DbClient';
export type { DbQueryResult, DbTableOperations } from './clients/db/types';
export { RedisClient } from './clients/db/RedisClient';
export type { RedisEntry } from './clients/db/RedisClient';
export { MailClient } from './clients/mail/MailClient';
export type { EmailMessage, WaitForEmailOptions } from './clients/mail/types';
export { AuthManager } from './clients/auth/AuthManager';
export { MockClient } from './clients/mock/MockClient';
export type { MockResponseOptions, InterceptedRequest } from './clients/mock/MockClient';
export { FakerClient } from './clients/faker/FakerClient';
export { MobileClient } from './clients/mobile/MobileClient';
export type { MobileLaunchOptions } from './clients/mobile/MobileClient';
export { MobileScreen } from './clients/mobile/MobileScreen';
export { MobileLocator } from './clients/mobile/MobileLocator';
export type { MobileLocatorOptions, MobileRole } from './clients/mobile/MobileLocator';
export { DeviceDetector } from './clients/mobile/DeviceDetector';
export type { MobileDeviceItem } from './clients/mobile/DeviceDetector';

// Context & State
export { TestContext } from './core/context/TestContext';
export { TestDataManager } from './core/context/TestDataManager';
export { StepLogger } from './core/steps/StepLogger';
export type { StepLogEntry } from './core/steps/StepLogger';

// Locators
export { LocatorRegistry } from './locators/LocatorRegistry';
export { LocatorParser } from './locators/LocatorParser';
export { LocatorTypeGen } from './locators/LocatorTypeGen';
export type { LocatorDef, SingleLocatorDef, PlatformLocatorDef, ParsedLocatorItem, TypedLocatorKey } from './locators/types';

// Quality & Audits
export { VisualClient } from './quality/visual/VisualClient';
export type { VisualSnapshotOptions } from './quality/visual/VisualClient';
export { A11yClient } from './quality/a11y/A11yClient';
export type { A11yOptions } from './quality/a11y/A11yClient';
export { PerformanceClient } from './quality/performance/PerformanceClient';
export type { WebVitals } from './quality/performance/PerformanceClient';

// CLI & Tools
export { DoctorService } from './cli/doctor/DoctorService';
export type { DoctorCheckItem } from './cli/doctor/DoctorService';
export { StepScanner } from './cli/scanner/StepScanner';
export type { FeatureStepItem, UnmappedStepResult } from './cli/scanner/StepScanner';
export { OpenApiGenerator } from './cli/generator/OpenApiGenerator';
export type { OpenApiEndpoint, GeneratedFeatureResult } from './cli/generator/OpenApiGenerator';
export { NotificationManager } from './cli/notifications/NotificationManager';
export type { NotificationPayload } from './cli/notifications/NotificationManager';
