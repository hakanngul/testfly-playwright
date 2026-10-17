import { TestFlyError } from '@testfly/playwright';

/**
 * Minimal shape of a mobile driver. Methods are looked up by name because
 * drivers differ in what they support; calling a missing one throws (ADR-001 D7).
 *
 * @public
 */
export type MobileDriver = Record<string, unknown>;

/**
 * Resolve `method` on the attached driver or throw a typed {@link TestFlyError}.
 * Never silently no-op or report a fake success when no driver is attached.
 *
 * @internal
 */
export function requireDriverMethod<T extends (...args: any[]) => any = (...args: any[]) => Promise<void>>(
  driver: MobileDriver | undefined,
  method: string,
  action: string,
): T {
  if (!driver) {
    throw new TestFlyError('TF_FEATURE_DISABLED', `Mobile action "${action}" requires a mobile driver, but none is attached.`, {
      hint: '@testfly/mobile is experimental and ships no driver; pass a driver object to MobileClient / MobileScreen.',
      details: { action, method },
    });
  }
  const fn = driver[method];
  if (typeof fn !== 'function') {
    throw new TestFlyError('TF_FEATURE_DISABLED', `Mobile action "${action}" is not supported by the attached driver (missing "${method}()").`, {
      hint: `Implement "${method}()" on your mobile driver.`,
      details: { action, method },
    });
  }
  return fn.bind(driver) as T;
}
