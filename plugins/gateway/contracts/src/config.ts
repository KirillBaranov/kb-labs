import { z } from 'zod';

export const UpstreamConfigSchema = z.object({
  url: z.string().url(),
  prefix: z.string().startsWith('/'),
  /** Strip prefix before forwarding. Default: keep prefix as-is. Use "" to strip. */
  rewritePrefix: z.string().optional(),
  /** Enable WebSocket proxying for this upstream. Default: false. */
  websocket: z.boolean().optional(),
  /** Paths under this prefix that are NOT proxied (handled by gateway itself). */
  excludePaths: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const StaticTokenEntrySchema = z.object({
  hostId: z.string(),
  namespaceId: z.string(),
});

// ── Pressure control (HTTP rate limiting via core ResourceBroker) ───────────
// See ADR-0056. Two layers: per-service (in onRequest, before auth) and
// per-tenant (in preHandler, after auth). Limit-only resources are registered
// at gateway boot via broker.registerLimit and queried via broker.tryAcquire.

export const RateLimitConfigSchema = z.object({
  tokensPerMinute: z.number().int().positive().optional(),
  requestsPerMinute: z.number().int().positive().optional(),
  requestsPerSecond: z.number().int().positive().optional(),
  maxConcurrentRequests: z.number().int().positive().optional(),
  /** 0..1, default 0.9 in core. Set to 1 to disable the safety cushion. */
  safetyMargin: z.number().min(0).max(1).optional(),
});

export const PressureRouteOverrideSchema = z.object({
  /** Resource id used in the broker, e.g. "gateway:route:webhooks-github". */
  resource: z.string().min(1),
  /** Path prefix matched against request.url (first match wins). */
  pathPrefix: z.string().startsWith('/'),
  /** HTTP methods this override applies to. Omit to match any method. */
  methods: z.array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])).optional(),
  limits: RateLimitConfigSchema,
});

export const PressureTenantConfigSchema = z.object({
  /** When true, applies per-tenant limits keyed by AuthContext.namespaceId. */
  enabled: z.boolean().default(false),
  /** Limits applied to each tenant. Resource id = "gateway:tenant:<namespaceId>". */
  limits: RateLimitConfigSchema,
});

export const PressureConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** Per-upstream limits. Resource id = "gateway:service:<name>". */
  perService: z.record(z.string(), RateLimitConfigSchema).default({}),
  /** Per-path-prefix overrides (checked before service-level resolution). */
  perRoute: z.array(PressureRouteOverrideSchema).default([]),
  /** Optional per-tenant layer (requires JWT). */
  perTenant: PressureTenantConfigSchema.optional(),
});

export const GatewayConfigSchema = z.object({
  port: z.number().default(4000),
  upstreams: z.record(z.string(), UpstreamConfigSchema).default({}),
  /** Static tokens seeded into ICache at bootstrap — for dev/service tokens before full auth */
  staticTokens: z.record(z.string(), StaticTokenEntrySchema).default({}),
  /** HTTP pressure control (rate limiting via ResourceBroker). */
  pressure: PressureConfigSchema.optional(),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type PressureRouteOverride = z.infer<typeof PressureRouteOverrideSchema>;
export type PressureTenantConfig = z.infer<typeof PressureTenantConfigSchema>;
export type PressureConfig = z.infer<typeof PressureConfigSchema>;
export type UpstreamConfig = z.infer<typeof UpstreamConfigSchema>;
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
