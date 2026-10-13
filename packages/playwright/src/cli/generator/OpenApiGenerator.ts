/** Normalized OpenAPI operation. @internal */
export interface OpenApiEndpoint {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: any[];
  requestBody?: any;
  responses: Record<string, any>;
}

/** A generated feature file. @internal */
export interface GeneratedFeatureResult {
  tag: string;
  fileName: string;
  content: string;
}

/** Generates BDD features from OpenAPI documents. @internal */
export class OpenApiGenerator {
  /**
   * Parse an OpenAPI/Swagger JSON or object and generate Gherkin feature scenarios
   */
  static generateFeatures(openApiDoc: Record<string, any>): GeneratedFeatureResult[] {
    const paths = openApiDoc.paths || {};
    const endpointsByTag: Map<string, OpenApiEndpoint[]> = new Map();

    for (const [pathUrl, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods as Record<string, any>)) {
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
          continue;
        }

        const tags: string[] = details.tags && details.tags.length > 0 ? details.tags : ['default'];
        const endpoint: OpenApiEndpoint = {
          path: pathUrl,
          method: method.toUpperCase(),
          summary: details.summary || `${method.toUpperCase()} ${pathUrl}`,
          description: details.description,
          tags,
          parameters: details.parameters,
          requestBody: details.requestBody,
          responses: details.responses || { '200': { description: 'Success' } },
        };

        for (const tag of tags) {
          const cleanTag = tag.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
          if (!endpointsByTag.has(cleanTag)) {
            endpointsByTag.set(cleanTag, []);
          }
          endpointsByTag.get(cleanTag)!.push(endpoint);
        }
      }
    }

    const results: GeneratedFeatureResult[] = [];

    for (const [tag, endpoints] of endpointsByTag.entries()) {
      const featureTitle = `API - ${tag.toUpperCase()} service tests`;
      let featureContent = `@api @${tag}\nFeature: ${featureTitle}\n\n`;

      for (const ep of endpoints) {
        const expectedStatus = Object.keys(ep.responses)[0] || '200';
        const scenarioTitle = `${ep.method} ${ep.path} - ${ep.summary}`;
        const sends = ['POST', 'PUT', 'PATCH'].includes(ep.method);

        featureContent += `  Scenario: ${scenarioTitle}\n`;
        featureContent += sends
          ? `    When I send a "${ep.method}" request with a body to "${ep.path}"\n`
          : `    When I send a "${ep.method}" request to "${ep.path}"\n`;
        featureContent += `    Then the response status is ${expectedStatus}\n`;
        featureContent += `    And the response body is not empty\n\n`;
      }

      results.push({
        tag,
        fileName: `api-${tag}.feature`,
        content: featureContent.trimEnd() + '\n',
      });
    }

    return results;
  }

  /**
   * Generate generic BDD steps template for API requests
   */
  static generateApiSteps(): string {
    return `import { When, Then, expect } from '@testfly/playwright/bdd';

When('I send a {string} request to {string}', async ({ api, ctx }, method: string, path: string) => {
  ctx.set('response', await api.fetch(path, { method }));
});

When('I send a {string} request with a body to {string}', async ({ api, ctx }, method: string, path: string) => {
  ctx.set('response', await api.fetch(path, { method, json: { name: 'TestFly entity', createdAt: new Date().toISOString() } }));
});

Then('the response status is {int}', async ({ ctx }, expected: number) => {
  expect(ctx.require<{ status: number }>('response').status).toBe(expected);
});

Then('the response body is not empty', async ({ ctx }) => {
  expect(ctx.require<{ data: unknown }>('response').data).toBeTruthy();
});
`;
  }
}
