import { describe, it, expect } from 'vitest';
import { TestContext } from '../src/context/TestContext';

describe('TestContext', () => {
  it('should store and retrieve isolated key-value pairs', () => {
    const context = new TestContext();

    context.set('orderId', 12345);
    context.set('customer', { name: 'Ahmet', email: 'ahmet@example.com' });

    expect(context.get('orderId')).toBe(12345);
    expect(context.get('customer').name).toBe('Ahmet');
    expect(context.has('orderId')).toBe(true);
    expect(context.has('nonExistent')).toBe(false);

    context.delete('orderId');
    expect(context.has('orderId')).toBe(false);
  });

  it('should interpolate dynamic variables with {{variable}} syntax', () => {
    const context = new TestContext();

    context.set('userId', 99);
    context.set('role', 'admin');
    context.set('user', { details: { city: 'Istanbul' } });

    const path = context.interpolate('/api/users/{{userId}}/roles/{{role}}');
    expect(path).toBe('/api/users/99/roles/admin');

    const nested = context.interpolate('User lives in {{user.details.city}}');
    expect(nested).toBe('User lives in Istanbul');
  });

  it('should handle response, token, and user shortcuts', () => {
    const context = new TestContext();

    context.setResponse({ status: 200, data: { ok: true } });
    context.setToken('jwt-secret-xyz');
    context.setUser({ id: 1, username: 'tester' });

    expect(context.getResponse().status).toBe(200);
    expect(context.getToken()).toBe('jwt-secret-xyz');
    expect(context.getUser().username).toBe('tester');

    const snapshot = context.snapshot();
    expect(snapshot.hasResponse).toBe(true);
    expect(snapshot.hasToken).toBe(true);
  });
});
