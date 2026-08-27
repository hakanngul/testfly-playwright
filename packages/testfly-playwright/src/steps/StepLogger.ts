import { test } from '@playwright/test';

export interface StepLogEntry {
  timestamp: Date;
  level: 'INFO' | 'WARN' | 'ERROR' | 'STEP';
  message: string;
  details?: unknown;
}

export class StepLogger {
  private logs: StepLogEntry[] = [];

  /**
   * Execute a named test step in Playwright's report timeline
   */
  public async step<T = void>(title: string, body?: () => Promise<T>): Promise<T> {
    this.record('STEP', title);
    try {
      if (body) {
        return await test.step(title, body);
      } else {
        return (await test.step(title, async () => {})) as unknown as T;
      }
    } catch {
      // Fallback outside of Playwright test runner context (e.g. unit tests)
      if (body) {
        return await body();
      }
      return undefined as unknown as T;
    }
  }

  /**
   * Log an informational message into the timeline and test output
   */
  public async info(message: string, details?: unknown): Promise<void> {
    this.record('INFO', message, details);
    const detailStr = details ? ` | ${JSON.stringify(details)}` : '';
    try {
      await test.step(`ℹ️ ${message}${detailStr}`, async () => {
        if (details) {
          try {
            await test.info().attach(`info-${Date.now()}`, {
              body: typeof details === 'string' ? details : JSON.stringify(details, null, 2),
              contentType: 'application/json',
            });
          } catch {
            // Ignore attachment errors outside test runner
          }
        }
      });
    } catch {
      // Fallback when outside test context
    }
  }

  /**
   * Log a warning message
   */
  public async warn(message: string, details?: unknown): Promise<void> {
    this.record('WARN', message, details);
    const detailStr = details ? ` | ${JSON.stringify(details)}` : '';
    try {
      await test.step(`⚠️ ${message}${detailStr}`, async () => {
        if (details) {
          try {
            await test.info().attach(`warn-${Date.now()}`, {
              body: typeof details === 'string' ? details : JSON.stringify(details, null, 2),
              contentType: 'application/json',
            });
          } catch {
            // Ignore attachment errors outside test runner
          }
        }
      });
    } catch {
      // Fallback
    }
  }

  /**
   * Log an error message
   */
  public async error(message: string, error?: unknown): Promise<void> {
    this.record('ERROR', message, error);
    const errStr = error instanceof Error ? error.stack || error.message : JSON.stringify(error);
    try {
      await test.step(`❌ ${message}`, async () => {
        if (error) {
          try {
            await test.info().attach(`error-${Date.now()}`, {
              body: String(errStr),
              contentType: 'text/plain',
            });
          } catch {
            // Ignore
          }
        }
      });
    } catch {
      // Fallback
    }
  }

  /**
   * Attach an artifact (text, JSON, binary) to the current test run
   */
  public async attach(name: string, content: string | Buffer, contentType = 'text/plain'): Promise<void> {
    try {
      await test.info().attach(name, {
        body: content,
        contentType,
      });
    } catch {
      // Fallback
    }
  }

  /**
   * Retrieve all recorded log entries
   */
  public getLogs(): StepLogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear recorded logs
   */
  public clear(): void {
    this.logs = [];
  }

  private record(level: StepLogEntry['level'], message: string, details?: unknown): void {
    const entry: StepLogEntry = {
      timestamp: new Date(),
      level,
      message,
      details,
    };
    this.logs.push(entry);
  }
}
