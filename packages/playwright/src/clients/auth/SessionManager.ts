import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { TestFlyError } from '../../core/errors';
import type { SessionOptions } from '../../core/config/schema';

/** Logs a role in using a fresh page. The resulting storage state is cached. @public */
export type SessionSetup = (page: Page) => Promise<void>;

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const globalProviders = new Map<string, SessionSetup>();

/**
 * Register a session provider for `role` globally (module level registry that only holds functions).
 * Call it from a test file or a shared setup module imported by your tests.
 *
 * @example
 * ```ts
 * defineSession('admin', async (page) => {
 *   await page.goto('/login');
 *   await page.getByLabel('Email').fill(process.env.ADMIN_EMAIL!);
 *   await page.getByRole('button', { name: 'Sign in' }).click();
 * });
 * ```
 * @public
 */
export function defineSession(role: string, setup: SessionSetup): void {
  globalProviders.set(role, setup);
}

/** The `session` fixture API. @public */
export interface SessionApi {
  /** Register a provider for `role` for the rest of this worker. */
  define(role: string, setup: SessionSetup): void;
  /** Log the current browser context in as `role` (creates and caches the session on first use). */
  as(role: string): Promise<void>;
  /** Path of the cached storage state file for `role` (it may not exist yet). */
  path(role: string): string;
  /** Drop the cached session of `role` (or all roles). */
  clear(role?: string): Promise<void>;
}

/** Context options forwarded to the temporary context used to create sessions. @internal */
export type SessionContextOptions = Pick<
  BrowserContextOptions,
  'baseURL' | 'ignoreHTTPSErrors' | 'locale' | 'timezoneId' | 'userAgent' | 'viewport' | 'httpCredentials' | 'extraHTTPHeaders' | 'proxy'
>;

function safeName(role: string): string {
  return role.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'default';
}

const LOCK_STALE_MS = 120_000;

/**
 * Worker-scoped session cache. Creation is serialized per role inside the worker and guarded by a
 * lock file across workers; files are written atomically.
 *
 * @internal
 */
export class SessionStore {
  private readonly local = new Map<string, SessionSetup>();
  private readonly inflight = new Map<string, Promise<string>>();
  private readonly verified = new Set<string>();
  private readonly runStarted: number;
  readonly dir: string;

  constructor(
    private readonly browser: Browser,
    private readonly options: SessionOptions,
    baseDir: string,
  ) {
    this.dir = path.resolve(baseDir, options.dir);
    const fromEnv = Number(process.env.TESTFLY_RUN_STARTED);
    this.runStarted = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : Date.now();
  }

  define(role: string, setup: SessionSetup): void {
    this.local.set(role, setup);
  }

  fileFor(role: string): string {
    return path.join(this.dir, `${safeName(role)}.json`);
  }

  async clear(role?: string): Promise<void> {
    const roles = role ? [role] : fs.existsSync(this.dir) ? fs.readdirSync(this.dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
    for (const r of roles) {
      this.verified.delete(r);
      fs.rmSync(this.fileFor(r), { force: true });
    }
  }

  /** Return the storage state file for `role`, creating it when missing or stale. */
  async ensure(role: string, contextOptions: SessionContextOptions): Promise<string> {
    const setup = this.local.get(role) ?? globalProviders.get(role);
    if (!setup) {
      throw new TestFlyError('TF_SESSION_PROVIDER_MISSING', `No session provider registered for role "${role}".`, {
        hint: `Call defineSession('${role}', async (page) => { /* log in */ }) or session.define('${role}', ...) before session.as('${role}').`,
        details: { role, known: [...new Set([...this.local.keys(), ...globalProviders.keys()])] },
      });
    }
    const pending = this.inflight.get(role);
    if (pending) return pending;
    const promise = this.createOrReuse(role, setup, contextOptions).finally(() => this.inflight.delete(role));
    this.inflight.set(role, promise);
    return promise;
  }

  private isFresh(file: string): boolean {
    let mtime: number;
    try {
      mtime = fs.statSync(file).mtimeMs;
    } catch {
      return false;
    }
    const { maxAgeMinutes } = this.options;
    if (maxAgeMinutes > 0) return Date.now() - mtime <= maxAgeMinutes * 60_000;
    return mtime >= this.runStarted;
  }

  private async createOrReuse(role: string, setup: SessionSetup, contextOptions: SessionContextOptions): Promise<string> {
    const file = this.fileFor(role);
    if (this.verified.has(role) && this.isFresh(file)) return file;
    if (this.isFresh(file)) {
      this.verified.add(role);
      return file;
    }
    fs.mkdirSync(this.dir, { recursive: true });
    const release = await this.acquireLock(`${file}.lock`);
    try {
      // Another worker may have created it while we waited for the lock.
      if (this.isFresh(file)) {
        this.verified.add(role);
        return file;
      }
      const context = await this.browser.newContext(contextOptions);
      try {
        const page = await context.newPage();
        await setup(page);
        const state = await context.storageState();
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
        fs.renameSync(tmp, file);
      } catch (cause) {
        throw new TestFlyError('TF_SESSION_SETUP_FAILED', `Session setup for role "${role}" failed: ${cause instanceof Error ? cause.message : String(cause)}`, {
          hint: 'Run the login steps manually and check credentials and selectors used in the session provider.',
          cause,
          details: { role },
        });
      } finally {
        await context.close().catch(() => undefined);
      }
      this.verified.add(role);
      return file;
    } finally {
      release();
    }
  }

  private async acquireLock(lockFile: string): Promise<() => void> {
    const started = Date.now();
    for (;;) {
      try {
        const fd = fs.openSync(lockFile, 'wx');
        fs.closeSync(fd);
        return () => fs.rmSync(lockFile, { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try {
          if (Date.now() - fs.statSync(lockFile).mtimeMs > LOCK_STALE_MS) {
            fs.rmSync(lockFile, { force: true });
            continue;
          }
        } catch {
          continue; // lock vanished, retry immediately
        }
        if (Date.now() - started > LOCK_STALE_MS) {
          throw new TestFlyError('TF_SESSION_SETUP_FAILED', `Timed out waiting for session lock ${lockFile}.`, { hint: 'Delete the stale .lock file.' });
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
}

/** Restore a storage state (cookies + localStorage) into `context`. @internal */
export async function applyStorageState(context: BrowserContext, file: string): Promise<void> {
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as StorageState;
  if (state.cookies.length) await context.addCookies(state.cookies);
  if (!state.origins.length) return;

  await context.addInitScript((origins) => {
    const entry = origins.find((o) => o.origin === window.location.origin);
    if (!entry) return;
    for (const { name, value } of entry.localStorage) {
      try {
        window.localStorage.setItem(name, value);
      } catch {
        /* storage may be unavailable (sandboxed frames) */
      }
    }
  }, state.origins);

  // Pages that are already open will not re-run init scripts until navigation.
  for (const page of context.pages()) {
    let origin: string;
    try {
      origin = new URL(page.url()).origin;
    } catch {
      continue;
    }
    const entry = state.origins.find((o) => o.origin === origin);
    if (!entry) continue;
    await page.evaluate((items) => {
      for (const { name, value } of items) window.localStorage.setItem(name, value);
    }, entry.localStorage);
  }
}

/** Build the per-test `session` facade. @internal */
export function createSessionApi(store: SessionStore, context: BrowserContext, contextOptions: SessionContextOptions): SessionApi {
  return {
    define: (role, setup) => store.define(role, setup),
    as: async (role) => {
      const file = await store.ensure(role, contextOptions);
      await applyStorageState(context, file);
    },
    path: (role) => store.fileFor(role),
    clear: (role) => store.clear(role),
  };
}
