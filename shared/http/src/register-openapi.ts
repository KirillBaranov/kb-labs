import { jsonSchemaTransform } from 'fastify-type-provider-zod';

/** Minimal structural interface to accept any Fastify instance regardless of version. */
interface FastifyLike {
  register(plugin: unknown, opts?: unknown): unknown;
  get(path: string, handler: (req: unknown, reply: unknown) => unknown): void;
  swagger?(): unknown;
}

export interface OpenAPIOptions {
  title: string;
  description?: string;
  version?: string;
  /** Route prefix for Swagger UI. Default: '/docs' */
  docsPath?: string;
  /** Route for the raw OpenAPI JSON spec. Default: '/openapi.json' */
  specPath?: string;
  servers?: Array<{ url: string; description?: string }>;
  /**
   * Set to false to skip Swagger UI registration (e.g. in production).
   * The spec endpoint (/openapi.json) is still registered.
   * Default: true
   */
  ui?: boolean;
}

/**
 * Wraps jsonSchemaTransform to safely handle routes with plain JSON schemas.
 * ftzp v6 only accepts Zod schemas — plain JSON objects cause InvalidSchemaError.
 * Routes without `tags` are hidden anyway (hideUntagged), so we skip transform
 * for them to avoid the error.
 */
function safeJsonSchemaTransform(input: { schema: Record<string, unknown>; url: string; [k: string]: unknown }) {
  const { schema } = input;

  // No schema or explicitly hidden — pass through
  if (!schema || schema.hide) {
    return input;
  }

  // Routes without tags will be excluded by hideUntagged.
  // Skip Zod transform for them to avoid errors on plain JSON schemas.
  if (!schema.tags || (Array.isArray(schema.tags) && schema.tags.length === 0)) {
    return { schema: { ...schema, hide: true }, url: input.url };
  }

  // Tagged routes — delegate to ftzp's jsonSchemaTransform (expects Zod schemas)
  return jsonSchemaTransform(input as unknown as Parameters<typeof jsonSchemaTransform>[0]);
}

/**
 * Registers @fastify/swagger + @fastify/swagger-ui on a Fastify instance.
 *
 * Call BEFORE registering routes, AFTER creating the Fastify instance.
 *
 * Routes without `tags:` are excluded from the spec (hideUntagged: true).
 * Use this as the visibility toggle — internal/undocumented routes simply
 * omit `tags:` and they won't appear in /docs or /openapi.json.
 *
 * @example
 * ```ts
 * import { registerOpenAPI } from '@kb-labs/shared-http';
 *
 * await registerOpenAPI(server, {
 *   title: 'My Service',
 *   version: '1.0.0',
 *   servers: [{ url: 'http://localhost:3000', description: 'Local dev' }],
 *   ui: process.env.NODE_ENV !== 'production',
 * });
 * ```
 */
export async function registerOpenAPI(server: FastifyLike, options: OpenAPIOptions): Promise<void> {
  const swagger = await import('@fastify/swagger');

  await server.register(swagger.default ?? swagger, {
    openapi: {
      info: {
        title: options.title,
        description: options.description ?? '',
        version: options.version ?? '1.0.0',
      },
      servers: options.servers ?? [],
    },
    transform: safeJsonSchemaTransform,
    hideUntagged: true,
  });

  const specPath = options.specPath ?? '/openapi.json';

  await server.register(async (scope: FastifyLike) => {
    scope.get(specPath, (_req, reply) => {
      const s = server as { swagger?: () => unknown };
      return (reply as { send(v: unknown): unknown }).send(s.swagger?.());
    });
  });

  if (options.ui !== false) {
    const swaggerUi = await import('@fastify/swagger-ui');

    await server.register(swaggerUi.default ?? swaggerUi, {
      routePrefix: options.docsPath ?? '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }
}
