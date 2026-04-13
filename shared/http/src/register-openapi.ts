/**
 * Registers @fastify/swagger + @fastify/swagger-ui on a Fastify instance.
 *
 * Routes without `tags:` are excluded from the spec (hideUntagged: true).
 * Use this as the visibility toggle — internal/undocumented routes simply
 * omit `tags:` and they won't appear in /docs or /openapi.json.
 *
 * Plain JSON Schema and Zod schemas are both supported natively by
 * @fastify/swagger without any custom transform.
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

import { zodToJsonSchema } from 'zod-to-json-schema';

/** Minimal structural interface to accept any Fastify instance regardless of version. */
interface FastifyLike {
  register(plugin: unknown, opts?: unknown): unknown;
  get(path: string, opts: unknown, handler: (req: unknown, reply: unknown) => unknown): void;
  swagger?(): unknown;
}

/** Returns true if the value is a Zod schema (has ._def). */
function isZod(v: unknown): boolean {
  return v != null && typeof v === 'object' && '_def' in (v as object);
}

/** Convert Zod schemas in a route schema object to plain JSON Schema. */
function convertSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...schema };
  for (const key of ['body', 'querystring', 'params', 'headers'] as const) {
    if (isZod(out[key])) { out[key] = zodToJsonSchema(out[key] as any); }
  }
  if (out['response'] && typeof out['response'] === 'object') {
    out['response'] = Object.fromEntries(
      Object.entries(out['response'] as Record<string, unknown>).map(([code, s]) => [
        code,
        isZod(s) ? zodToJsonSchema(s as any) : s,
      ]),
    );
  }
  return out;
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

export async function registerOpenAPI(server: FastifyLike, options: OpenAPIOptions): Promise<void> {
  const swagger = await import('@fastify/swagger');

  // @fastify/swagger uses fastify-plugin — decorates the root instance with swagger().
  // transform() converts any Zod schemas to plain JSON Schema via zodToJsonSchema.
  // Plain JSON Schema passes through unchanged. Routes can freely mix both.
  await server.register(swagger.default ?? swagger, {
    openapi: {
      info: {
        title: options.title,
        description: options.description ?? '',
        version: options.version ?? '1.0.0',
      },
      servers: options.servers ?? [],
    },
    hideUntagged: true,
    transform({ schema, url }: { schema: Record<string, unknown>; url: string }) {
      return { schema: convertSchema(schema), url };
    },
  });

  const specPath = options.specPath ?? '/openapi.json';
  const docsPath = options.docsPath ?? '/docs';

  if (options.ui !== false) {
    const swaggerUi = await import('@fastify/swagger-ui');

    await server.register(swaggerUi.default ?? swaggerUi, {
      routePrefix: docsPath,
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }

  // /openapi.json — canonical spec endpoint.
  // x-openapi-spec: true header signals to response middlewares (e.g. envelope wrappers)
  // that this is a raw spec response and must not be wrapped.
  (server as any).get(specPath, { schema: { hide: true } }, (_req: unknown, reply: unknown) => {
    const s = server as { swagger?: () => Record<string, unknown> | undefined };
    const spec = s.swagger?.();
    const r = reply as {
      code(n: number): { send(v: unknown): unknown };
      header(k: string, v: string): unknown;
      send(v: unknown): unknown;
    };
    if (!spec) {
      r.code(503).send({ error: 'OpenAPI spec not ready' });
      return;
    }
    r.header('x-openapi-spec', '1');
    r.send(spec);
  });
}
