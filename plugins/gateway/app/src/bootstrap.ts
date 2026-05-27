import { logDiagnosticEvent } from '@kb-labs/core-platform';
import { platform, createServiceBootstrap, getPlatformRoot, getProjectRoot } from '@kb-labs/core-runtime';
import { createCorrelatedLogger } from '@kb-labs/shared-http';
import type { IHostStore } from '@kb-labs/gateway-contracts';
import type { IDocumentDatabase } from '@kb-labs/core-platform/adapters';
import { HostStore } from '@kb-labs/gateway-core';
import {
  UsersStore,
  CredentialsStore,
  MembershipsStore,
  SessionsStore,
  InvitesStore,
  ProviderRegistry,
  createEmailPasswordProvider,
  createPasswordPolicy,
  createUserAuthService,
  createStubPDP,
  createTenantResolver,
  createRateLimiter,
  ensureBootstrapAdmin,
} from '@kb-labs/gateway-auth';
import type { IKVStore } from '@kb-labs/core-platform/adapters';
import { loadGatewayConfig } from './config.js';
import { createServer, type UserAuthServerDeps } from './server.js';
import { HostRegistry } from './hosts/registry.js';
import { registerPressureLimits } from './pressure/index.js';

export async function bootstrap(repoRoot: string = process.cwd()): Promise<void> {
  // 1. Initialize platform (loads .env + adapters from kb.config.json)
  await createServiceBootstrap({ appId: 'gateway', repoRoot });

  const logger = createCorrelatedLogger(platform.logger, {
    serviceId: 'gateway',
    logsSource: 'gateway',
    layer: 'gateway',
    service: 'bootstrap',
    operation: 'gateway.bootstrap',
  });
  logger.info('Platform initialized', { repoRoot });

  // 2. Load gateway config — reads platform baseline + project layer +
  // `.kb/overlays/*.jsonc`. Use the resolved roots from core-runtime
  // (which honour KB_PROJECT_ROOT and the platform.dir override) rather
  // than process.cwd() — in installed mode the gateway process is
  // spawned with cwd at the platform root, and we MUST not conflate
  // that with the project root.
  const config = await loadGatewayConfig(getProjectRoot() ?? repoRoot, getPlatformRoot());
  logger.info('Gateway config loaded', {
    port: config.port,
    upstreams: Object.keys(config.upstreams),
  });

  // 3. Create persistent host store backed by the platform document database.
  // The same code runs on sqlite locally and on postgres/mongo in prod — the
  // gateway has no business knowing which driver is wired underneath.
  let hostStore: IHostStore | undefined;
  const docs = platform.getAdapter<IDocumentDatabase>('documentDatabase');
  if (docs) {
    hostStore = new HostStore(docs);
    logger.info('Host store: documentDatabase-backed (persistent)');
  } else {
    logger.warn('Host store: none (cache-only, hosts will be lost on restart)');
  }

  // 3b. User auth infrastructure (ADR-0020). Only available when the
  //     documentDatabase adapter is wired; gracefully absent otherwise.
  let userAuth: UserAuthServerDeps | undefined;
  if (docs) {
    // Auth config with explicit defaults (config.auth is optional, fields have zod defaults
    // only when the auth section is present and parsed; here we apply our own fallbacks).
    // Env vars allow E2E CI to override TTLs and cookie security without touching the config
    // file (e.g. AUTH_ACCESS_TTL_SEC=5 for session-lifecycle tests, AUTH_COOKIE_SECURE=false
    // for HTTP-only CI environments).
    const accessTtlSec =
      config.auth?.sessionAccessTtlSec ??
      (process.env.AUTH_ACCESS_TTL_SEC ? parseInt(process.env.AUTH_ACCESS_TTL_SEC, 10) : 900);
    const refreshTtlSec =
      config.auth?.sessionRefreshTtlSec ??
      (process.env.AUTH_REFRESH_TTL_SEC
        ? parseInt(process.env.AUTH_REFRESH_TTL_SEC, 10)
        : 30 * 24 * 3600);
    const graceWindowMs = (config.auth?.refreshGraceWindowSec ?? 5) * 1000;
    const bcryptCost = config.auth?.bcryptCost ?? 12;
    // AUTH_COOKIE_SECURE=false disables Secure flag for HTTP-only CI environments.
    // In production (HTTPS) leave unset or set to true.
    const cookieSecure =
      config.auth?.cookieSecure ??
      (process.env.AUTH_COOKIE_SECURE === 'false' ? false : true);
    const tenantPattern = config.tenants?.pattern ?? '{tenant}.kblabs.ru';
    const bootstrapTenantId =
      config.auth?.bootstrap?.tenantId ??
      process.env.GATEWAY_BOOTSTRAP_TENANT_ID ??
      'kblabs-cloud';

    const users = new UsersStore(docs);
    const credentials = new CredentialsStore(docs);
    const memberships = new MembershipsStore(docs);
    const sessions = new SessionsStore(docs, {
      refreshTtlMs: refreshTtlSec * 1000,
      graceWindowMs,
    });
    const invites = new InvitesStore(docs);
    const providers = new ProviderRegistry();

    const emailPwd = createEmailPasswordProvider({
      users,
      credentials,
      tenantId: bootstrapTenantId,
      bcryptCost,
    });
    providers.register(emailPwd);

    const passwordPolicy = createPasswordPolicy({
      minLength: config.auth?.passwordPolicy?.minLength ?? 8,
      maxLength: config.auth?.passwordPolicy?.maxLength ?? 256,
      hibpEnabled: config.auth?.passwordPolicy?.hibpEnabled ?? true,
    });

    const pdp = createStubPDP({ memberships });

    const tenantResolver = createTenantResolver({ pattern: tenantPattern });

    const userAuthService = createUserAuthService({
      users,
      credentials,
      memberships,
      sessions,
      invites,
      providers,
      passwordPolicy,
      jwtConfig: { secret: process.env.GATEWAY_JWT_SECRET ?? 'dev-insecure-secret-change-me' },
      accessTtlSec,
      refreshTtlSec,
      bcryptCost,
    });

    // Seed bootstrap admin account (step 1.14). Idempotent.
    const adminEmail =
      config.auth?.bootstrap?.adminEmail ?? process.env.GATEWAY_BOOTSTRAP_ADMIN_EMAIL;
    const adminPassword = process.env.GATEWAY_BOOTSTRAP_ADMIN_PASSWORD;
    await ensureBootstrapAdmin({
      bootstrap:
        adminEmail && adminPassword
          ? { adminEmail, adminPassword, tenantId: bootstrapTenantId }
          : undefined,
      users,
      credentials,
      memberships,
      bcryptCost,
      logger,
    }).catch((err) => {
      logger.warn('Bootstrap admin seed failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // AUTH_INVITE_TTL_MS env var overrides config (used in E2E to test short-lived invites).
    const inviteTtlMs = process.env.AUTH_INVITE_TTL_MS
      ? parseInt(process.env.AUTH_INVITE_TTL_MS, 10)
      : (config.auth?.inviteTtlMs ?? 7 * 24 * 60 * 60 * 1000);

    // Rate limiter — uses kvStore if available; silently absent otherwise.
    const kv = platform.getAdapter<IKVStore>('kvStore');
    const rateLimiter = kv ? createRateLimiter(kv) : undefined;
    if (!kv) {
      logger.warn('kvStore adapter not configured — auth rate limiting disabled');
    }

    const loginPerIpPerMinute = config.auth?.rateLimit?.loginPerIpPerMinute ?? 10;
    const loginPerEmailPerMinute = config.auth?.rateLimit?.loginPerEmailPerMinute ?? 5;

    userAuth = {
      userAuthService,
      users,
      sessions,
      invites,
      providers,
      pdp,
      tenantResolver,
      cookieSecure,
      accessTtlSec,
      refreshTtlSec,
      inviteTtlMs,
      rateLimiter,
      authRateLimit: { loginPerIpPerMinute, loginPerEmailPerMinute },
    };

    logger.info('User auth infrastructure initialised', {
      tenantPattern,
      bootstrapTenantId,
      cookieSecure,
    });
  } else {
    logger.warn('User auth unavailable: no documentDatabase adapter configured');
  }

  // 4. Create host registry with cache + store
  // Capture once so registry and server share the exact same cache instance.
  const cache = platform.cache;
  const registry = new HostRegistry(cache, hostStore);

  // 5. Restore persisted hosts into cache (best-effort — cache may be unavailable on cold start)
  let restoredCount = 0;
  try {
    restoredCount = await registry.restore();
  } catch (error) {
    logDiagnosticEvent(platform.logger, {
      domain: 'registry',
      event: 'gateway.hosts.restore',
      level: 'error',
      reasonCode: 'registry_restore_failed',
      message: 'Failed to restore gateway host registry',
      outcome: 'failed',
      error: error instanceof Error ? error : new Error(String(error)),
      serviceId: 'gateway',
      evidence: {
        persistentStore: !!hostStore,
      },
    });
    // Non-fatal: gateway can start without restored state; hosts will re-register on reconnect
  }
  if (restoredCount > 0) {
    logger.info('Restored hosts from store', { count: restoredCount });
  }

  // 6. Seed static tokens into cache so resolveToken() accepts them
  for (const [token, entry] of Object.entries(config.staticTokens)) {
    await cache.set(`host:token:${token}`, entry);
    logger.info('Static token seeded', { hostId: entry.hostId, namespaceId: entry.namespaceId });
  }

  // 7. Build JWT config — secret required; no fallback in production.
  const DEV_JWT_SECRET = 'dev-insecure-secret-change-me';
  const jwtSecret = process.env.GATEWAY_JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  if (!jwtSecret && isProduction) {
    throw new Error(
      'GATEWAY_JWT_SECRET must be set in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
    );
  }
  if (!jwtSecret) {
    logger.warn('GATEWAY_JWT_SECRET not set — using insecure default (dev only, never use in production!)');
  }
  const jwtConfig = { secret: jwtSecret ?? DEV_JWT_SECRET };

  // 8. Register HTTP pressure-control limits (ADR-0056). No-op when
  //    `gateway.pressure` is absent or disabled in config.
  if (platform.hasResourceBroker) {
    registerPressureLimits(platform.resourceBroker, config.pressure, platform.logger);
  } else {
    logger.warn('Resource broker unavailable — pressure control disabled');
  }

  // 9. Create server with injected registry and optional user auth deps
  const server = await createServer(config, cache, platform.logger, jwtConfig, registry, userAuth);

  // 9. Listen
  const address = await server.listen({ port: config.port, host: '0.0.0.0' });
  logger.info('Gateway listening', { address });

  // 10. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.warn('Received shutdown signal', { signal });
    await platform.shutdown();
    await server.close();
    logger.info('Gateway shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
