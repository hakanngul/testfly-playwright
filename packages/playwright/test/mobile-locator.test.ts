import { describe, it, expect, vi } from 'vitest';
import { MobileLocator } from '../src/clients/mobile/MobileLocator';

describe('MobileLocator Gestures and Actions', () => {
  it('should delegate tap, doubleTap, and longPress to driver', async () => {
    const mockDriver = {
      tap: vi.fn().mockResolvedValue(undefined),
      doubleTap: vi.fn().mockResolvedValue(undefined),
      longPress: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      swipe: vi.fn().mockResolvedValue(undefined),
      isVisible: vi.fn().mockResolvedValue(true),
      isEnabled: vi.fn().mockResolvedValue(true),
    };

    const locator = new MobileLocator('btn-submit', 'testid', {}, mockDriver);

    await locator.tap();
    expect(mockDriver.tap).toHaveBeenCalledWith(locator);

    await locator.doubleTap();
    expect(mockDriver.doubleTap).toHaveBeenCalledWith(locator);

    await locator.longPress(1500);
    expect(mockDriver.longPress).toHaveBeenCalledWith(locator, 1500);

    await locator.fill('hello world');
    expect(mockDriver.fill).toHaveBeenCalledWith(locator, 'hello world');

    await locator.clear();
    expect(mockDriver.clear).toHaveBeenCalledWith(locator);

    await locator.swipe('up', { distance: 300 });
    expect(mockDriver.swipe).toHaveBeenCalledWith('up', { distance: 300, target: locator });

    const visible = await locator.toBeVisible();
    expect(visible).toBe(true);

    const enabled = await locator.toBeEnabled();
    expect(enabled).toBe(true);
  });

  it('should support indexing chaining with first(), last(), nth()', () => {
    const parent = new MobileLocator('.cell-item', 'type');

    const first = parent.first();
    expect(first.options.index).toBe(0);

    const last = parent.last();
    expect(last.options.index).toBe(-1);

    const second = parent.nth(2);
    expect(second.options.index).toBe(2);
  });
});
