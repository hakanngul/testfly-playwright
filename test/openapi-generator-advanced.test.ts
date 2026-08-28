import { describe, it, expect } from 'vitest';
import { OpenApiGenerator } from '../src/cli/generator/OpenApiGenerator';

describe('OpenApiGenerator Advanced', () => {
  it('should categorize endpoints by multiple tags and handle POST/PUT body scenarios', () => {
    const spec = {
      paths: {
        '/users': {
          post: {
            tags: ['Users', 'Auth'],
            summary: 'Create new user',
            responses: { '201': { description: 'Created' } },
          },
        },
        '/orders/{id}': {
          delete: {
            tags: ['Orders'],
            summary: 'Delete order by ID',
            responses: { '204': { description: 'Deleted' } },
          },
        },
      },
    };

    const features = OpenApiGenerator.generateFeatures(spec);
    expect(features.length).toBe(3); // users, auth, orders tags

    const userFeature = features.find((f) => f.tag === 'users');
    expect(userFeature).toBeDefined();
    expect(userFeature?.content).toContain('When "POST" metoduyla "/users" endpointine veri gönderilir');
    expect(userFeature?.content).toContain('API yanıt kodu 201 olmalıdır');


    const orderFeature = features.find((f) => f.tag === 'orders');
    expect(orderFeature?.content).toContain('When "DELETE" metoduyla "/orders/{id}" endpointi çağrılır');
    expect(orderFeature?.content).toContain('API yanıt kodu 204 olmalıdır');

  });

  it('should generate generic typed step definitions for API feature executions', () => {
    const stepsCode = OpenApiGenerator.generateApiSteps();
    expect(stepsCode).toContain("Given('API istemcisi hazır'");
    expect(stepsCode).toContain("Then('API yanıt kodu {int} olmalıdır'");
  });
});
