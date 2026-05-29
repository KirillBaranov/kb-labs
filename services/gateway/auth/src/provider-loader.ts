/**
 * @module @kb-labs/gateway-auth/provider-loader
 *
 * Config-driven loader for identity providers (ADR-0020, DD-3).
 *
 * This is the gateway-side analogue of the platform adapter loader
 * (`core/runtime/src/loader.ts` notifier sub-channels): a type→factory
 * map for the built-ins, plus dynamic `import()` of a package for any
 * non-builtin `type`. Two deliberate departures from the platform
 * loader:
 *
 * - **Fail-fast, not warn-skip.** A misconfigured *platform* adapter can
 *   degrade gracefully; a misconfigured *auth door* must never boot
 *   half-open. If a configured provider cannot be loaded, we throw.
 * - **Gateway-owned (Pattern B).** Providers need gateway-domain ports
 *   (users/credentials) and the tenant context, which don't exist until
 *   gateway bootstrap — well after platform assembly. So the loader lives
 *   here, not in core.
 *
 * The built-in `email-password` provider is the zero-config default: an
 * empty/absent `providers` config registers it and nothing else. It has
 * no special status beyond being the one we ship — it goes through the
 * exact same factory path a third-party provider would.
 */

import type {
  IdentityProviderDeps,
  IdentityProviderFactory,
} from '@kb-labs/core-contracts';
import { ProviderRegistry } from './provider-registry.js';
import { createEmailPasswordProvider } from './providers/email-password.js';
import { createOidcProvider } from './providers/oidc.js';

/**
 * A single provider entry from `auth.providers` config. `type` is the
 * discriminator (built-in name or package name); everything else is
 * provider-specific and validated by the provider's own zod schema.
 */
export interface ProviderConfigEntry {
  type: string;
  [key: string]: unknown;
}

export type ProvidersConfig = Record<string, ProviderConfigEntry> | undefined;

/**
 * Thin adapter from the `(config, deps)` factory shape to the existing
 * `createEmailPasswordProvider(opts)`. The provider only reads the narrow
 * ports, so deps map straight through (DD-3).
 */
const emailPasswordFactory: IdentityProviderFactory = (_config, deps) =>
  createEmailPasswordProvider({
    users: deps.users,
    credentials: deps.credentials,
    tenantId: deps.tenantId,
    bcryptCost: deps.bcryptCost,
  });

/**
 * Built-in factories keyed by `type`. Anything not here is resolved as a
 * package name. `oidc` is the generic OIDC redirect provider (Google / Okta /
 * Auth0 / Keycloak / Azure AD); it owns its own zod config schema.
 */
export const BUILTIN_FACTORIES: Record<string, IdentityProviderFactory> = {
  'email-password': emailPasswordFactory,
  oidc: createOidcProvider,
};

interface ExternalProviderModule {
  createIdentityProvider?: IdentityProviderFactory;
  default?: IdentityProviderFactory;
}

async function resolveFactory(
  id: string,
  type: string,
): Promise<IdentityProviderFactory> {
  const builtin = BUILTIN_FACTORIES[type];
  if (builtin) {
    return builtin;
  }

  // Non-builtin type → treat as a package name and import it (DD-3).
  // Any failure is fatal: a configured auth door that cannot load must
  // stop the boot rather than silently disappear.
  let mod: ExternalProviderModule;
  try {
    mod = (await import(type)) as ExternalProviderModule;
  } catch (err) {
    throw new Error(
      `identity provider "${id}": failed to load package "${type}": ${(err as Error).message}`,
    );
  }

  const factory = mod.createIdentityProvider ?? mod.default;
  if (typeof factory !== 'function') {
    throw new Error(
      `identity provider "${id}": package "${type}" exports neither ` +
        'createIdentityProvider nor a default factory',
    );
  }
  return factory;
}

/**
 * Build a {@link ProviderRegistry} from the `auth.providers` config.
 *
 * @param config The `auth.providers` map (or undefined).
 * @param deps Shared dependencies handed to every provider factory.
 * @returns A populated registry. Throws (fail-fast) on any load error.
 */
export async function loadIdentityProviders(
  config: ProvidersConfig,
  deps: IdentityProviderDeps,
): Promise<ProviderRegistry> {
  const registry = new ProviderRegistry();
  const entries = Object.entries(config ?? {});

  if (entries.length === 0) {
    // Zero-config default: the built-in email-password door (DD-3).
    const provider = await emailPasswordFactory(
      { type: 'email-password', id: 'email-password' },
      deps,
    );
    registry.register(provider);
    return registry;
  }

  for (const [id, entry] of entries) {
    const factory = await resolveFactory(id, entry.type);
    // Inject the instance id so providers (e.g. oidc) can identify
    // themselves and build per-instance callback URLs.
    const provider = await factory({ ...entry, id }, deps);
    registry.register(provider);
  }

  return registry;
}
