import { describe, it, expect } from 'vitest';
import { VisualClient } from '../src/visual/VisualClient';

describe('VisualClient', () => {
  it('should instantiate and define visual assert methods', () => {
    const mockPage: any = {
      locator: () => ({}),
    };

    const visual = new VisualClient(mockPage);
    expect(typeof visual.assertSnapshot).toBe('function');
    expect(typeof visual.assertElementSnapshot).toBe('function');
  });
});
