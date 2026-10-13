import { describe, it, expect } from 'vitest';
import { ApiClient } from '../src/clients/api/ApiClient';

import { z } from 'zod';

describe('ApiClient assertSchema', () => {
  it('should pass validation when payload matches Zod schema', () => {
    const client = new ApiClient({} as any);

    const UserSchema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    });

    const validResponse = {
      data: {
        id: 1,
        name: 'Alice',
        email: 'alice@example.com',
      },
    };

    expect(() => client.assertSchema(validResponse, UserSchema)).not.toThrow();
  });

  it('should throw clear error when payload fails schema', () => {
    const client = new ApiClient({} as any);

    const UserSchema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().email(),
    });

    const invalidResponse = {
      data: {
        id: 'wrong_id_type',
        name: 'Alice',
        email: 'not-an-email',
      },
    };

    expect(() => client.assertSchema(invalidResponse, UserSchema)).toThrow('API Schema Validation Failed');
  });
});
