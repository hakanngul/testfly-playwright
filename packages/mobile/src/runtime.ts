import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TestFlyError } from '@testfly/playwright';
import type * as Mobilewright from 'mobilewright';

/** The `mobilewright` module (ESM-only, loaded on first use). @internal */
export type MobilewrightModule = typeof Mobilewright;

/** The part of `@mobilewright/core` the fixtures wire up (soft assertions). @internal */
export interface MobilewrightCoreHooks {
  setSoftFailureHandler(handler: (error: Error) => void): void;
}

// Mobilewright is ESM-only, so it is always loaded with a real `import()` (the CommonJS build keeps it:
// see tsup.config.ts). The state lives on globalThis so every entry bundle (`.`, `/bdd`) shares it.
interface RuntimeState {
  loaded?: MobilewrightModule;
  pending?: Promise<MobilewrightModule>;
  corePending?: Promise<MobilewrightCoreHooks | undefined>;
}
const STATE_KEY = Symbol.for('testfly.mobile.runtime');
const state: RuntimeState = ((globalThis as Record<symbol, RuntimeState | undefined>)[STATE_KEY] ??= {});

const nativeImport = (url: string): Promise<unknown> => import(url);

/** Path of the installed `mobilewright` entry: the consumer's project first (pnpm strict layouts), then this package. */
function resolveMobilewright(): string {
  try {
    return createRequire(join(process.cwd(), 'noop.js')).resolve('mobilewright');
  } catch {
    return createRequire(join(__dirname, 'noop.js')).resolve('mobilewright');
  }
}

/**
 * Load the optional peer `mobilewright` once per worker. Throws `TF_OPTIONAL_DEPENDENCY_MISSING`
 * with an install hint when it is not installed.
 *
 * @internal
 */
export function loadMobilewright(): Promise<MobilewrightModule> {
  state.pending ??= (async () => {
    let entry: string;
    try {
      entry = resolveMobilewright();
    } catch (cause) {
      state.pending = undefined;
      throw new TestFlyError('TF_OPTIONAL_DEPENDENCY_MISSING', 'Native mobile testing (@testfly/mobile) requires the optional package "mobilewright".', {
        hint: 'Install it in your project: npm i -D mobilewright (it brings mobilecli, which drives the devices).',
        cause,
      });
    }
    state.loaded = (await nativeImport(pathToFileURL(entry).href)) as MobilewrightModule;
    return state.loaded;
  })();
  return state.pending;
}

/**
 * `@mobilewright/core` as used by the installed `mobilewright` (resolved from its location, so pnpm's
 * strict layout and the exact same module instance are both honoured). `undefined` if it cannot be found.
 *
 * @internal
 */
export function loadMobilewrightCore(): Promise<MobilewrightCoreHooks | undefined> {
  state.corePending ??= (async () => {
    try {
      const corePath = createRequire(resolveMobilewright()).resolve('@mobilewright/core');
      return (await nativeImport(pathToFileURL(corePath).href)) as MobilewrightCoreHooks;
    } catch {
      return undefined;
    }
  })();
  return state.corePending;
}

/** The module if a fixture already loaded it (used by the synchronous `expect` dispatch). @internal */
export function loadedMobilewright(): MobilewrightModule | undefined {
  return state.loaded;
}
