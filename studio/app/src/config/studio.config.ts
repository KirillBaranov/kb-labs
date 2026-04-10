/**
 * Studio configuration
 *
 * Environment variables:
 * - KB_API_BASE_URL: API base URL (default: '/api/v1' — proxied through rspack devServer to Gateway :4000, which routes /api/v1/* to REST API :5050)
 * - KB_GATEWAY_TOKEN: Bearer token for Gateway auth (dev: 'dev-studio-token')
 * - KB_DATA_SOURCE_MODE: 'mock' | 'http' (default: 'http')
 * - KB_EVENTS_BASE_URL: SSE base URL (default: same as KB_API_BASE_URL)
 * - KB_EVENTS_REGISTRY_PATH: SSE registry path (default: '/events/registry')
 * - KB_EVENTS_AUTH_TOKEN: SSE auth token (default: same as KB_GATEWAY_TOKEN)
 * - KB_EVENTS_HEADERS: SSE extra headers as JSON string
 *
 * All traffic flows through Gateway (:4000). rspack devServer proxies /api and /plugins to Gateway.
 */
import { validateStudioConfig } from './studio.config.schema';
import { getStudioEnv } from './env';

function resolveUrl(base: string, path: string): string {
  if (!path) {
    return base;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  if (path.startsWith('/')) {
    return `${base.replace(/\/$/, '')}${path}`;
  }
  return `${base.replace(/\/$/, '')}/${path}`;
}

const env = getStudioEnv();
const apiBaseUrl = env.KB_API_BASE_URL || '/api/v1';
const gatewayTokenEnv = env.KB_GATEWAY_TOKEN;
const eventsBaseUrlEnv = env.KB_EVENTS_BASE_URL || apiBaseUrl;
const registryEventsPath = env.KB_EVENTS_REGISTRY_PATH || '/events/registry';
const eventsAuthTokenEnv = env.KB_EVENTS_AUTH_TOKEN;
const eventsHeadersEnv = env.KB_EVENTS_HEADERS;

function parseHeaders(value: string | undefined): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([key, val]) => [String(key), String(val)])
      );
    }
  } catch {
    // fall through
  }
  return undefined;
}

// Raw configuration object (before validation)
const rawConfig = {
  dataSourceMode: (env.KB_DATA_SOURCE_MODE || 'http') as 'mock' | 'http',
  apiBaseUrl,
  gatewayToken: gatewayTokenEnv,
  features: {
    enableDevlink: false,
    enableMind: false,
    enableAnalytics: false,
    sse: true,
    analytics: true,
  },
  events: {
    baseUrl: eventsBaseUrlEnv,
    registryPath: registryEventsPath,
    registryUrl: resolveUrl(eventsBaseUrlEnv, registryEventsPath),
    retryDelays: [250, 1_000, 2_000, 5_000],
    // KB_EVENTS_AUTH_TOKEN takes precedence; fall back to gateway token so
    // a single KB_GATEWAY_TOKEN covers both REST and SSE connections.
    token: eventsAuthTokenEnv ?? gatewayTokenEnv,
    headers: parseHeaders(eventsHeadersEnv),
  },
};

/**
 * Validated studio configuration
 * This will throw ZodError with clear error messages if config is malformed
 */
export const studioConfig = validateStudioConfig(rawConfig);
