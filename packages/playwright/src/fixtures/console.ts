import type { BrowserContext, Page } from '@playwright/test';
import { CONTENT_TYPES, toAttachment, type ConsoleEvent } from '@testfly/reporter/schema';
import type { ConsoleErrorsOptions } from '../core/config/schema';
import { TestFlyError } from '../core/errors';
import { coreTest } from './core';

/** Browser errors collected for the current test. @public */
export interface ConsoleErrorsApi {
  /** Errors seen so far (uncaught exceptions and, unless disabled, `console.error` calls). */
  list(): ConsoleEvent[];
  /** Forget the errors seen so far, e.g. after a step that is expected to log one. */
  clear(): void;
  /** Throw `TF_CONSOLE_ERRORS` now if any error was collected. */
  expectNone(): void;
}

/** Test-scoped fixtures of {@link consoleTest}. @public */
export interface ConsoleFixtures {
  /** Browser errors of every page opened in this test's context. */
  consoleErrors: ConsoleErrorsApi;
}

/** Collects errors from every page of one browser context. @internal */
export class ConsoleCollector {
  readonly events: ConsoleEvent[] = [];
  private readonly ignore: RegExp[];

  constructor(private readonly options: ConsoleErrorsOptions) {
    this.ignore = options.ignore.map((p) => new RegExp(p));
  }

  watch(context: BrowserContext): void {
    for (const page of context.pages()) this.watchPage(page);
    context.on('page', (page) => this.watchPage(page));
  }

  private watchPage(page: Page): void {
    page.on('pageerror', (err) => this.push({ type: 'pageerror', message: err.message, url: safeUrl(page), timestamp: Date.now() }));
    if (!this.options.includeConsole) return;
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const loc = msg.location();
      this.push({
        type: 'console',
        message: msg.text(),
        url: safeUrl(page),
        location: loc.url ? `${loc.url}:${loc.lineNumber + 1}:${loc.columnNumber + 1}` : undefined,
        timestamp: Date.now(),
      });
    });
  }

  private push(event: ConsoleEvent): void {
    if (this.ignore.some((re) => re.test(event.message))) return;
    this.events.push(event);
  }

  error(): TestFlyError {
    const lines = this.events.slice(0, 10).map((e) => `    - [${e.type}] ${e.message.split('\n')[0]}${e.url ? ` (${e.url})` : ''}`);
    const more = this.events.length > 10 ? `\n    … and ${this.events.length - 10} more` : '';
    return new TestFlyError('TF_CONSOLE_ERRORS', `The page logged ${this.events.length} error(s):\n${lines.join('\n')}${more}`, {
      hint: 'Fix the errors, ignore known ones with testfly.consoleErrors.ignore, or set consoleErrors.mode to "report".',
      details: { count: this.events.length },
    });
  }
}

function safeUrl(page: Page): string | undefined {
  try {
    return page.url();
  } catch {
    return undefined;
  }
}

/**
 * Browser error collection (ported from TestFly's ConsoleErrorCollector).
 *
 * Overrides `context`, so it only runs in tests that open a browser; API-only tests pay nothing.
 * Every page of the context is watched for uncaught exceptions and `console.error`.
 * At the end of the test the errors are attached for the TestFly reporter and, with
 * `testfly.consoleErrors.mode: 'fail'`, a test that otherwise passed fails with `TF_CONSOLE_ERRORS`.
 *
 * @public
 */
export const consoleTest = coreTest.extend<ConsoleFixtures & { _consoleCollector: ConsoleCollector | null }>({
  _consoleCollector: async ({ testfly }, use, testInfo) => {
    const options = testfly.consoleErrors;
    if (options.mode === 'off') {
      await use(null);
      return;
    }
    const collector = new ConsoleCollector(options);
    await use(collector);
    if (collector.events.length === 0) return;
    await testInfo.attach('testfly-console', toAttachment(CONTENT_TYPES.console, collector.events));
    // Only turn a passing body into a failure; an already failing test keeps its own error.
    if (options.mode === 'fail' && testInfo.status === 'passed') {
      throw collector.error();
    }
  },

  context: async ({ context, _consoleCollector }, use) => {
    _consoleCollector?.watch(context);
    await use(context);
  },

  consoleErrors: async ({ context, _consoleCollector }, use) => {
    void context; // make sure the pages of this test are watched
    const events = () => _consoleCollector?.events ?? [];
    await use({
      list: () => [...events()],
      clear: () => {
        events().length = 0;
      },
      expectNone: () => {
        if (_consoleCollector && _consoleCollector.events.length) throw _consoleCollector.error();
      },
    });
  },
});
