import { describe, it, expect, vi } from 'vitest';
import { MobileClient } from '../src/mobile/MobileClient';
import { MobileScreen } from '../src/mobile/MobileScreen';

describe('MobileClient & MobileScreen', () => {
  it('should locate elements by text, label, testid, role and trigger gestures', async () => {
    const mockDriver = {
      tap: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      swipe: vi.fn().mockResolvedValue(undefined),
      pressButton: vi.fn().mockResolvedValue(undefined),
      launchApp: vi.fn().mockResolvedValue(undefined),
      terminateApp: vi.fn().mockResolvedValue(undefined),
      isVisible: vi.fn().mockResolvedValue(true),
    };

    const client = new MobileClient(mockDriver);

    // App Lifecycle
    await client.launchApp('com.example.bankapp');
    expect(mockDriver.launchApp).toHaveBeenCalledWith('com.example.bankapp', {});

    await client.terminateApp('com.example.bankapp');
    expect(mockDriver.terminateApp).toHaveBeenCalledWith('com.example.bankapp');

    // Screen Locators & Gestures
    const button = client.screen.getByRole('button', { name: 'Giriş Yap' });
    expect(button.selector).toBe('button');
    expect(button.options.name).toBe('Giriş Yap');

    await button.tap();
    expect(mockDriver.tap).toHaveBeenCalledWith(button);

    const input = client.screen.getByLabel('E-posta');
    await input.fill('test@example.com');
    expect(mockDriver.fill).toHaveBeenCalledWith(input, 'test@example.com');

    await client.screen.swipe('up', { distance: 300 });
    expect(mockDriver.swipe).toHaveBeenCalledWith('up', { distance: 300 });

    await client.screen.pressButton('HOME');
    expect(mockDriver.pressButton).toHaveBeenCalledWith('HOME');

    const visible = await button.toBeVisible();
    expect(visible).toBe(true);
  });
});
