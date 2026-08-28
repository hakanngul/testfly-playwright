import { describe, it, expect, vi } from 'vitest';
import { LocatorRegistry } from '../src/locators/LocatorRegistry';

describe('LocatorRegistry', () => {
  it('should resolve Web Playwright locators based on definition type', () => {
    const registry = new LocatorRegistry();
    registry.register('login.username', { type: 'label', value: 'Username' });
    registry.register('login.submit', { type: 'role', role: 'button', name: 'Submit' });
    registry.register('login.logo', { type: 'testid', value: 'app-logo' });

    const mockPage: any = {
      getByLabel: vi.fn().mockReturnValue('label-locator'),
      getByRole: vi.fn().mockReturnValue('role-locator'),
      getByTestId: vi.fn().mockReturnValue('testid-locator'),
      locator: vi.fn().mockReturnValue('css-locator'),
    };

    const loc1 = registry.resolveWeb(mockPage, 'login.username');
    expect(mockPage.getByLabel).toHaveBeenCalledWith('Username', { exact: undefined });
    expect(loc1).toBe('label-locator');

    const loc2 = registry.resolveWeb(mockPage, 'login.submit');
    expect(mockPage.getByRole).toHaveBeenCalledWith('button', { name: 'Submit', exact: undefined });
    expect(loc2).toBe('role-locator');

    const loc3 = registry.resolveWeb(mockPage, 'login.logo');
    expect(mockPage.getByTestId).toHaveBeenCalledWith('app-logo');
    expect(loc3).toBe('testid-locator');
  });

  it('should resolve Mobilewright MobileLocator on screen', () => {
    const registry = new LocatorRegistry();
    registry.register('home.header', {
      mobile: { type: 'text', value: 'Welcome' },
    });

    const mockScreen: any = {
      getByText: vi.fn().mockReturnValue('mobile-text-loc'),
    };

    const loc = registry.resolveMobile(mockScreen, 'home.header');
    expect(mockScreen.getByText).toHaveBeenCalledWith('Welcome');
    expect(loc).toBe('mobile-text-loc');
  });
});
