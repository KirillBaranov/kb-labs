# ADR-0023: Rspack for Module Federation Builds

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** Kirill Baranov
**Last Reviewed:** 2026-04-01
**Tags:** build, module-federation, rspack, studio

## Context

Studio V2 (ADR-0022) uses Module Federation to load plugin UI pages as MF remotes. The initial implementation used Vite with `@module-federation/vite` adapter for both host and remote builds.

Problems encountered with Vite MF adapter:

1. **Builds hang indefinitely** — `vite build` with MF plugin freezes without output or error
2. **Generates temp artifacts** — `.__mf__temp/`, `.mf/`, `dummy-non-existing-folder/` pollute the repo
3. **Adapter, not native** — MF is a webpack-native feature; Vite adapter is a third-party wrapper with limited stability
4. **Not maintained by MF team** — the Vite adapter is community-driven, not part of the official Module Federation project

Module Federation was originally designed for webpack. The MF team (Zack Jackson / ByteDance) actively develops and recommends Rspack as the production bundler for MF workloads.

## Decision

Use **Rspack** for all Module Federation builds — both Studio host app and plugin widget remotes.

**Rspack** is a Rust-based webpack-compatible bundler by ByteDance:
- Native MF support via `@module-federation/enhanced` — maintained by the same team that develops MF core
- Webpack-compatible config API — `rspack.config.ts` ≈ `webpack.config.ts`
- 5-10x faster than webpack on cold builds
- Built-in SWC loader for TypeScript/JSX — no babel/ts-loader needed
- Production-proven at ByteDance (TikTok), Microsoft, Amazon

### What changes

| Before | After |
|--------|-------|
| `vite.config.ts` (host) | `rspack.config.ts` |
| `vite.studio.config.ts` (remotes) | `rspack.studio.config.ts` |
| `@module-federation/vite` | `@module-federation/enhanced` |
| `vite` + `@vitejs/plugin-react` | `@rspack/cli` + `@rspack/core` |
| `kbStudioRemote()` returns Vite plugin | `kbStudioRemoteConfig()` returns Rspack config |

### What does NOT change

- `@module-federation/runtime` — `init()`, `loadRemote()` are bundler-agnostic
- All runtime code: `widget-loader.ts`, `PageContainer`, `PageErrorBoundary`
- SDK hooks, UIKit, event-bus, types, manifests
- tsup for backend/library packages
- REST API, gateway, registry architecture

## Consequences

### Positive

- Reliable MF builds — native support, no adapter layer
- Fast builds — Rust-based compilation with built-in SWC
- Single build tool for all Studio-related code (host + remotes), no tool zoo
- Webpack plugin ecosystem available if needed in the future
- MF team actively supports Rspack — issues get fixed upstream

### Negative

- New dependency in the stack (Rspack binary ~50MB per package)
- Dev server less mature than Vite for SPA development
- Documentation thinner than webpack (but API is compatible, webpack docs apply)
- Team needs to learn Rspack config (mitigated by webpack compatibility)

### Alternatives Considered

**Webpack 5:** Native MF support, maximum ecosystem maturity. Rejected because Rspack provides the identical API 5-10x faster, maintained by the same team.

**Stay on Vite:** Keep `@module-federation/vite` adapter. Rejected because builds are unreliable (hanging), adapter is community-maintained with no SLA, and MF team does not recommend Vite for production MF workloads.

**Dynamic ESM imports (no MF):** Drop Module Federation entirely, use plain `import()` for loading remote modules. Rejected because this loses shared dependency deduplication — each plugin would bundle its own React/antd copy.

## Implementation

1. Rewrite `@kb-labs/studio-plugin-tools` — `kbStudioRemote()` → `kbStudioRemoteConfig()` using `@module-federation/enhanced`
2. Create `rspack.config.ts` for Studio host app (`apps/studio`)
3. Create `rspack.studio.config.ts` for commit plugin remote (`commit-cli`)
4. Update `package.json` scripts: `vite build` → `rspack build`, `vite` → `rspack serve`
5. Delete Vite configs and Vite-specific dependencies
6. Template for future plugin remotes follows the same pattern

This decision will be revisited if Vite gains native MF support (currently not on Vite roadmap).

## References

- [ADR-0022: Studio Widget System V2](./0022-studio-widget-system-v2.md)
- [ADR-0009: React SPA with Vite](./0009-react-spa-with-vite.md) — superseded for MF builds
- [Rspack Documentation](https://rspack.dev/)
- [Module Federation Enhanced](https://module-federation.io/)

---

**Last Updated:** 2026-04-01
