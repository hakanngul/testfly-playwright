import { describe, it, expect, vi } from 'vitest';
import { LocatorParser } from '../src/locators/LocatorParser';
import { LocatorRegistry } from '../src/locators/LocatorRegistry';

describe('Locator Parser & Registry Edge Cases', () => {
  it('should throw descriptive error on invalid malformed YAML/JSON', () => {
    const invalidYaml = 'invalid: { unclosed: [';
    expect(() => LocatorParser.parseContent('bad_page', invalidYaml)).toThrowError(
      /Failed to parse locator file for page "bad_page"/
    );
  });

  it('should fallback to raw selector when key is not registered in registry', () => {
    const registry = new LocatorRegistry();
    const mockPage: any = {
      locator: vi.fn().mockReturnValue('fallback-css-locator'),
    };

    const loc = registry.resolveWeb(mockPage, '#non-existent-button');
    expect(mockPage.locator).toHaveBeenCalledWith('#non-existent-button');
    expect(loc).toBe('fallback-css-locator');
  });

  it('should correctly prioritize iOS specific selector over generic mobile selector', () => {
    const registry = new LocatorRegistry();
    registry.register('nav.profile', {
      mobile: { type: 'label', value: 'GenericProfile' },
      ios: { type: 'label', value: 'iOSProfile' },
      android: { type: 'label', value: 'AndroidProfile' },
    });

    const mockScreen: any = {
      getByLabel: vi.fn().mockImplementation((val) => `screen-${val}`),
    };

    const iosLoc = registry.resolveMobile(mockScreen, 'nav.profile', 'ios');
    expect(mockScreen.getByLabel).toHaveBeenCalledWith('iOSProfile');

    const androidLoc = registry.resolveMobile(mockScreen, 'nav.profile', 'android');
    expect(mockScreen.getByLabel).toHaveBeenCalledWith('AndroidProfile');
  });
});
