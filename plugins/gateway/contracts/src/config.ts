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

export const GatewayConfigSchema = z.object({
  port: z.number().default(4000),
  upstreams: z.record(z.string(), UpstreamConfigSchema).default({}),
  /** Static tokens seeded into ICache at bootstrap — for dev/service tokens before full auth */
  staticTokens: z.record(z.string(), StaticTokenEntrySchema).default({}),
});

export type UpstreamConfig = z.infer<typeof UpstreamConfigSchema>;
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
