import { describe, expect, it } from 'vitest';
import { normalizeDef, normalizeMobileDef, selectPlatformDef } from '../../src/locators/schema';
import { describeDef, LocatorRegistry } from '../../src/locators';
import { TestFlyError } from '../../src/core/errors';

function err(fn: () => unknown): TestFlyError {
  try {
    fn();
  } catch (e) {
    return e as TestFlyError;
  }
  throw new Error('expected a throw');
}

describe('mobile locator blocks', () => {
  it('a plain string is a test id; objects take one selector plus modifiers and fallbacks', () => {
    expect(normalizeMobileDef('login_btn', 'k')).toEqual({ testid: 'login_btn' });
    expect(normalizeMobileDef({ role: 'button', name: 'Sign In', nth: 1, fallbacks: [{ text: 'Login' }, 'btn'] }, 'k')).toEqual({
      role: 'button',
      name: 'Sign In',
      nth: 1,
      fallbacks: [{ text: 'Login' }, { testid: 'btn' }],
    });
    expect(normalizeMobileDef({ type: 'XCUIElementTypeDatePicker' }, 'k')).toEqual({ type: 'XCUIElementTypeDatePicker' });
  });

  it('rejects invalid mobile blocks with TF_LOCATOR_INVALID naming the key', () => {
    expect(err(() => normalizeDef({ css: '#a', ios: { accessibility_id: 'x' } }, 'login.k')).message).toContain('login.k.ios');
    expect(err(() => normalizeDef({ css: '#a', android: { label: 'a', text: 'b' } }, 'p.k')).message).toContain('multiple mobile selector fields');
    expect(err(() => normalizeDef({ css: '#a', mobile: { name: 'x', text: 'y' } }, 'p.k')).message).toContain('"name" is only valid together with "role"');
    expect(err(() => normalizeDef({ css: '#a', mobile: 1 }, 'p.k')).code).toBe('TF_LOCATOR_INVALID');
    expect(err(() => normalizeDef({ css: '#a', ios: { css: '#x' } }, 'p.k')).message).toContain('"css"');
  });

  it('accepts mobile-only keys, which the web locate() rejects clearly', () => {
    const def = normalizeDef({ ios: { label: 'Email' }, android: 'email_input' }, 'login.email');
    expect(def).toEqual({ platforms: { ios: { label: 'Email' }, android: { testid: 'email_input' } } });
    expect(describeDef(def)).toBe('mobile-only');
    const reg = new LocatorRegistry().register('login.email', { ios: { label: 'Email' } });
    const e = err(() => reg.resolve({} as never, 'login.email'));
    expect(e.code).toBe('TF_LOCATOR_INVALID');
    expect(e.message).toContain('only has native mobile definitions');
  });

  it('selectPlatformDef prefers the platform block, then mobile:, then a mobile-compatible shared definition', () => {
    const both = normalizeDef({ label: 'Email', ios: { testid: 'emailField' }, mobile: { text: 'E-mail' } }, 'k');
    expect(selectPlatformDef(both, 'ios')).toEqual({ testid: 'emailField' });
    expect(selectPlatformDef(both, 'android')).toEqual({ text: 'E-mail' });

    const shared = normalizeDef({ role: 'button', name: 'Save', fallbacks: [{ text: 'Save' }, { css: '.save' }] }, 'k');
    expect(selectPlatformDef(shared, 'android')).toEqual({ role: 'button', name: 'Save', fallbacks: [{ text: 'Save' }] });

    expect(selectPlatformDef(normalizeDef({ css: '#save' }, 'k'), 'ios')).toBeUndefined();
    expect(selectPlatformDef(normalizeDef({ role: 'heading', level: 2 }, 'k'), 'ios')).toBeUndefined();
  });
});
