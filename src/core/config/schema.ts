import { z } from 'zod';

export const DatabaseConfigSchema = z.object({
  connectionString: z.string().optional(),
  type: z.enum(['postgres', 'mysql', 'mongodb', 'sqlite', 'memory']).default('memory'),
  mock: z.boolean().default(false),
  options: z.record(z.unknown()).optional(),
});

export const MailConfigSchema = z.object({
  provider: z.enum(['mailpit', 'mailtrap', 'imap', 'mock']).default('mock'),
  url: z.string().optional(),
  apiKey: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  user: z.string().optional(),
  pass: z.string().optional(),
});

export const AuthConfigSchema = z.object({
  storageStatePath: z.string().default('./.auth/user.json'),
  autoSave: z.boolean().default(false),
  tokenKey: z.string().default('token'),
});

export const TimeoutsConfigSchema = z.object({
  action: z.number().default(10000),
  navigation: z.number().default(30000),
  expect: z.number().default(5000),
});

export const ReportingConfigSchema = z.object({
  timeline: z.boolean().default(true),
  stepScreenshots: z.enum(['always', 'only-on-failure', 'never']).default('only-on-failure'),
  aiTriage: z.boolean().default(false),
});

export const MobileConfigSchema = z.object({
  platform: z.enum(['ios', 'android', 'auto']).default('auto'),
  bundleId: z.string().optional(),
  deviceName: z.string().optional(),
  installApps: z.string().optional(),
  timeout: z.number().default(15000),
  serverUrl: z.string().optional(),
  env: z.record(z.string()).optional(),
});

export const TestFlyConfigSchema = z.object({
  baseUrl: z.string().default('http://localhost:3000'),
  apiBaseUrl: z.string().optional(),
  env: z.enum(['local', 'dev', 'staging', 'prod', 'test']).default('local'),
  timeouts: TimeoutsConfigSchema.default({}),
  database: DatabaseConfigSchema.optional(),
  mail: MailConfigSchema.optional(),
  auth: AuthConfigSchema.default({}),
  reporting: ReportingConfigSchema.default({}),
  mobile: MobileConfigSchema.optional(),
  custom: z.record(z.unknown()).optional(),
});

export type TestFlyConfig = z.infer<typeof TestFlyConfigSchema>;
export type TestFlyConfigInput = z.input<typeof TestFlyConfigSchema>;
export type MobileConfig = z.infer<typeof MobileConfigSchema>;

