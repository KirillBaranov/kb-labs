/**
 * @module @kb-labs/core-registry/generators/openapi-spec
 * Generate OpenAPI specs from ManifestV3.
 * Moved from @kb-labs/cli-core/generators/openapi.
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import type { OpenAPISpec } from '../types.js';

export function generateOpenAPISpec(manifest: ManifestV3): OpenAPISpec {
  const spec: OpenAPISpec = {
    openapi: '3.1.0',
    info: {
      title: manifest.display?.name || manifest.id,
      version: manifest.version,
      description: manifest.display?.description,
    },
    paths: {},
    components: { schemas: {} },
    'x-kb-plugin-id': manifest.id,
  };

  if (manifest.rest?.routes) {
    for (const route of manifest.rest.routes) {
      const p = route.path;
      const method = route.method.toLowerCase();
      if (!spec.paths[p]) {spec.paths[p] = {};}

      const operation: Record<string, unknown> = {
        summary: route.description || `${route.method} ${route.path}`,
        operationId: `${manifest.id}:${method}:${p}`,
        responses: { '200': { description: 'Success' } },
      };

      if (route.input) {
        operation.requestBody = {
          required: true,
          content: { 'application/json': { schema: route.input } },
        };
      }
      if (route.output) {
        operation.responses = {
          '200': {
            description: 'Success',
            content: { 'application/json': { schema: route.output } },
          },
        };
      }

      (spec.paths[p] as Record<string, unknown>)[method] = operation;
    }
  }

  return spec;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function collectPaths(specs: OpenAPISpec[]): Array<[string, Record<string, unknown>]> {
  const allPaths: Array<[string, Record<string, unknown>]> = [];
  for (const spec of specs) {
    const pluginId = spec['x-kb-plugin-id'] || 'unknown';
    for (const [p, pathItem] of Object.entries(spec.paths)) {
      const enhanced = { ...(pathItem as Record<string, unknown>) };
      for (const method of HTTP_METHODS) {
        if (enhanced[method]) {
          enhanced[method] = { ...(enhanced[method] as Record<string, unknown>), 'x-kb-plugin-id': pluginId };
        }
      }
      allPaths.push([p, enhanced]);
    }
  }
  return allPaths;
}

export function mergeOpenAPISpecs(specs: OpenAPISpec[]): OpenAPISpec {
  if (specs.length === 0) {
    return { openapi: '3.1.0', info: { title: 'KB Labs API', version: '1.0.0' }, paths: {} };
  }
  if (specs.length === 1) {return specs[0]!;}

  const merged: OpenAPISpec = {
    openapi: '3.1.0',
    info: { title: 'KB Labs API', version: '1.0.0', description: 'Aggregated API from all plugins' },
    paths: {},
    components: { schemas: {} },
  };

  const sorted = [...specs].sort((a, b) =>
    (a['x-kb-plugin-id'] || '').localeCompare(b['x-kb-plugin-id'] || ''),
  );

  const allPaths = collectPaths(sorted);
  allPaths.sort((a, b) => a[0].localeCompare(b[0]));
  for (const [p, pathItem] of allPaths) {
    merged.paths[p] = pathItem;
  }

  for (const spec of sorted) {
    const pluginId = spec['x-kb-plugin-id'] || 'unknown';
    if (spec.components?.schemas) {
      const entries = Object.entries(spec.components.schemas).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [name, schema] of entries) {
        (merged.components!.schemas as Record<string, unknown>)[`${pluginId}__${name}`] = schema;
      }
    }
  }

  return merged;
}
