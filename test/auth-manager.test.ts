import { describe, it, expect } from 'vitest';
import { AuthManager } from '../src/clients/auth/AuthManager';


describe('AuthManager', () => {
  it('should store and retrieve tokens', () => {
    const auth = new AuthManager();
    expect(auth.getToken()).toBeNull();

    auth.setToken('jwt-sample-token');
    expect(auth.getToken()).toBe('jwt-sample-token');
  });

  it('should report session presence accurately', () => {
    const auth = new AuthManager();
    expect(auth.hasSession('./non-existent-session.json')).toBe(false);
  });
});
