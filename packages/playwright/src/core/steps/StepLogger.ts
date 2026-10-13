import { test, type TestInfo } from '@playwright/test';
import { CONTENT_TYPES, toAttachment, type StepEvent } from '@testfly/reporter/schema';

/** Level of a logged step. @public */
export type StepLevel = StepEvent['level'];

/**
 * The `step` fixture: callable (`step('title', body)`) and a logger (`step.info(...)`).
 * Every call shows up in Playwright's timeline (via `test.step`) and is also collected and
 * attached once at the end of the test as `testfly-steps` for the TestFly reporter.
 *
 * @public
 */
export interface StepApi {
  /** Run `body` inside a named Playwright step. Records `pass` or `fail` and rethrows failures. */
  <T = void>(title: string, body?: () => Promise<T> | T): Promise<T>;
  /** Log an informational entry. */
  info(message: string, details?: unknown): Promise<void>;
  /** Log a successful checkpoint. */
  pass(message: string, details?: unknown): Promise<void>;
  /** Log a warning (does not fail the test). */
  warn(message: string, details?: unknown): Promise<void>;
  /** Log a failure marker (does not throw; use `expect` to fail). */
  fail(message: string, details?: unknown): Promise<void>;
  /** Attach arbitrary content to the current test. */
  attach(name: string, content: string | Buffer, contentType?: string): Promise<void>;
  /** Events recorded so far. */
  events(): StepEvent[];
}

const LABELS: Record<StepLevel, string> = { info: '[info] ', pass: '[pass] ', warn: '[warn] ', fail: '[fail] ' };

/**
 * Implementation behind the `step` fixture.
 * @internal
 */
export class StepLogger {
  private readonly recorded: StepEvent[] = [];
  private readonly startedAt = Date.now();

  constructor(private readonly testInfo: TestInfo) {}

  /** Build the callable facade handed to tests. */
  toApi(): StepApi {
    const api = (<T>(title: string, body?: () => Promise<T> | T): Promise<T> => this.run(title, body)) as StepApi;
    api.info = (message, details) => this.log('info', message, details);
    api.pass = (message, details) => this.log('pass', message, details);
    api.warn = (message, details) => this.log('warn', message, details);
    api.fail = (message, details) => this.log('fail', message, details);
    api.attach = (name, content, contentType = 'text/plain') => this.attach(name, content, contentType);
    api.events = () => [...this.recorded];
    return api;
  }

  async run<T>(title: string, body?: () => Promise<T> | T): Promise<T> {
    try {
      const result = await test.step(title, async () => (body ? await body() : (undefined as T)));
      this.record('pass', title);
      return result;
    } catch (error) {
      this.record('fail', title, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async log(level: StepLevel, message: string, details?: unknown): Promise<void> {
    this.record(level, message, details);
    await test.step(`${LABELS[level]}${message}`, async () => {
      if (details !== undefined) {
        await this.attach(
          `${level}-details`,
          typeof details === 'string' ? details : JSON.stringify(details, null, 2),
          typeof details === 'string' ? 'text/plain' : 'application/json',
        );
      }
    });
  }

  async attach(name: string, content: string | Buffer, contentType: string): Promise<void> {
    await this.testInfo.attach(name, { body: content, contentType });
  }

  /** Attach the collected events once. Called from fixture teardown. */
  async flush(): Promise<void> {
    if (this.recorded.length === 0) return;
    await this.testInfo.attach('testfly-steps', toAttachment(CONTENT_TYPES.step, this.recorded));
  }

  private record(level: StepLevel, title: string, details?: unknown): void {
    const event: StepEvent = { title, level, offsetMs: Math.max(0, Date.now() - this.startedAt) };
    if (details !== undefined) event.details = details;
    this.recorded.push(event);
  }
}
