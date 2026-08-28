export class TestContext {
  private store = new Map<string, any>();
  private lastResponse: any = null;
  private authToken: string | null = null;
  private currentUser: any = null;

  /**
   * Set a key-value pair in scenario context
   */
  set<T = any>(key: string, value: T): this {
    this.store.set(key, value);
    return this;
  }

  /**
   * Get a value by key from scenario context
   */
  get<T = any>(key: string, defaultValue?: T): T {
    if (this.store.has(key)) {
      return this.store.get(key) as T;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return undefined as unknown as T;
  }

  /**
   * Check if a key exists in scenario context
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Delete a key from scenario context
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clear all scenario context data
   */
  clear(): void {
    this.store.clear();
    this.lastResponse = null;
    this.authToken = null;
    this.currentUser = null;
  }

  /**
   * Get all entries as a plain Record object
   */
  getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [k, v] of this.store.entries()) {
      result[k] = v;
    }
    return result;
  }

  /**
   * Interpolate template string replacing `{{variable}}` with stored context values or env vars.
   * Example: `interpolate('/api/users/{{userId}}/orders')` -> `'/api/users/105/orders'`
   */
  interpolate(template: string): string {
    if (!template || typeof template !== 'string') return template;

    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key) => {
      // 1. Check direct context key
      if (this.store.has(key)) {
        return String(this.store.get(key));
      }

      // 2. Check nested dot notation in context (e.g. `user.id`)
      const nestedVal = this.getNestedValue(key);
      if (nestedVal !== undefined && nestedVal !== null) {
        return String(nestedVal);
      }

      // 3. Check environment variables
      if (process.env[key] !== undefined) {
        return String(process.env[key]);
      }

      // Return original match if not found
      return match;
    });
  }

  private getNestedValue(path: string): any {
    const parts = path.split('.');
    let current: any = this.getAll();
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  // --- Common Scenario Data Shortcuts ---

  setResponse(response: any): this {
    this.lastResponse = response;
    this.set('lastResponse', response);
    return this;
  }

  getResponse<T = any>(): T {
    return (this.lastResponse || this.get('lastResponse')) as T;
  }

  setToken(token: string): this {
    this.authToken = token;
    this.set('authToken', token);
    return this;
  }

  getToken(): string | null {
    return this.authToken || this.get('authToken', null);
  }

  setUser<T = any>(user: T): this {
    this.currentUser = user;
    this.set('currentUser', user);
    return this;
  }

  getUser<T = any>(): T {
    return (this.currentUser || this.get('currentUser')) as T;
  }

  /**
   * Returns a JSON snapshot of the current scenario context state for debugging & reports
   */
  snapshot(): Record<string, any> {
    return {
      store: this.getAll(),
      hasResponse: !!this.lastResponse,
      hasToken: !!this.authToken,
      hasUser: !!this.currentUser,
    };
  }
}
