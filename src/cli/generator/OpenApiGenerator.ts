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

export interface GeneratedFeatureResult {
  tag: string;
  fileName: string;
  content: string;
}

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
      const featureTitle = `API - ${tag.toUpperCase()} Servis Testleri`;
      let featureContent = `@api @${tag}\nFeature: ${featureTitle}\n\n`;

      for (const ep of endpoints) {
        const expectedStatus = Object.keys(ep.responses)[0] || '200';
        const scenarioTitle = `${ep.method} ${ep.path} - ${ep.summary}`;

        featureContent += `  Scenario: ${scenarioTitle}\n`;
        featureContent += `    Given API istemcisi hazır\n`;

        if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
          featureContent += `    When "${ep.method}" metoduyla "${ep.path}" endpointine veri gönderilir\n`;
        } else {
          featureContent += `    When "${ep.method}" metoduyla "${ep.path}" endpointi çağrılır\n`;
        }

        featureContent += `    Then API yanıt kodu ${expectedStatus} olmalıdır\n`;
        featureContent += `    And yanıt gövdesi geçerli bir nesne içermelidir\n\n`;
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
    return `import { Given, When, Then, expect } from '@testfly/playwright';

let lastResponse: any = null;

Given('API istemcisi hazır', async ({ api, step }) => {
  await step.info('API istemcisi yapılandırıldı');
  expect(api).toBeDefined();
});

When('{string} metoduyla {string} endpointi çağrılır', async ({ api, step }, method: string, path: string) => {
  await step.info(\`\${method} isteği gönderiliyor: \${path}\`);
  lastResponse = await (api as any)[method.toLowerCase()](path);
});

When('{string} metoduyla {string} endpointine veri gönderilir', async ({ api, step }, method: string, path: string) => {
  await step.info(\`\${method} isteği gönderiliyor: \${path}\`);
  lastResponse = await (api as any)[method.toLowerCase()](path, {
    name: 'Testfly Entity',
    createdAt: new Date().toISOString()
  });
});

Then('API yanıt kodu {int} olmalıdır', async ({ step }, expectedStatus: number) => {
  await step.info(\`Yanıt kodu kontrol ediliyor. Beklenen: \${expectedStatus}, Gelen: \${lastResponse.status}\`);
  expect(lastResponse.status).toBe(expectedStatus);
});

Then('yanıt gövdesi geçerli bir nesne içermelidir', async ({ step }) => {
  await step.info('Yanıt veri içeriği kontrol ediliyor');
  expect(lastResponse.data).toBeDefined();
});
`;
  }
}
