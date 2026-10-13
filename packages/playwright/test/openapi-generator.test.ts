import { describe, it, expect } from 'vitest';
import { OpenApiGenerator } from '../src/cli/generator/OpenApiGenerator';


describe('OpenApiGenerator', () => {
  const sampleSpec = {
    openapi: '3.0.0',
    info: { title: 'Sample API', version: '1.0' },
    paths: {
      '/users': {
        get: {
          tags: ['users'],
          summary: 'List all users',
          responses: { '200': { description: 'OK' } },
        },
        post: {
          tags: ['users'],
          summary: 'Create a user',
          responses: { '201': { description: 'Created' } },
        },
      },
      '/products/{id}': {
        get: {
          tags: ['products'],
          summary: 'Get product by ID',
          responses: { '200': { description: 'OK' } },
        },
        delete: {
          tags: ['products'],
          summary: 'Delete product',
          responses: { '204': { description: 'No Content' } },
        },
      },
    },
  };

  it('should generate feature files grouped by tags', () => {
    const features = OpenApiGenerator.generateFeatures(sampleSpec);
    expect(features).toHaveLength(2);

    const usersFeature = features.find((f) => f.tag === 'users');
    expect(usersFeature).toBeDefined();
    expect(usersFeature?.fileName).toBe('api-users.feature');
    expect(usersFeature?.content).toContain('Feature: API - USERS Servis Testleri');
    expect(usersFeature?.content).toContain('Scenario: GET /users - List all users');
    expect(usersFeature?.content).toContain('Scenario: POST /users - Create a user');

    const productsFeature = features.find((f) => f.tag === 'products');
    expect(productsFeature).toBeDefined();
    expect(productsFeature?.content).toContain('DELETE /products/{id}');
  });

  it('should generate step definitions template', () => {
    const stepsCode = OpenApiGenerator.generateApiSteps();
    expect(stepsCode).toContain("Given('API istemcisi hazır'");
    expect(stepsCode).toContain("When('{string} metoduyla {string} endpointi çağrılır'");
    expect(stepsCode).toContain("Then('API yanıt kodu {int} olmalıdır'");
  });
});
