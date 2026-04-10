# ADR-0009: React SPA with Vite

**Date:** 2025-11-01
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, ui/ux]

## Context

KB Labs Studio needs a modern web UI for observing and managing the KB Labs ecosystem. We considered:
- React SPA vs Next.js SSR
- Vite vs Create React App vs Webpack
- Standalone app vs embedded in existing infrastructure

Studio is primarily for internal dashboard use, needs fast development iteration, and should be lightweight.

## Decision

**Build Studio as a React 18 SPA using Vite as the build tool.**

Key aspects:
- **No SSR**: Studio is an internal tool, doesn't need SEO or server rendering
- **Vite**: Fast HMR, ESM-native, modern tooling, excellent DX
- **SPA routing**: React Router for client-side navigation
- **DevKit integration**: Use `@kb-labs/devkit/vite/react-app` preset for consistency

## Consequences

### Positive

- Fast development with Vite HMR
- Small bundle size without SSR overhead
- Easy deployment to static hosting
- Consistent tooling via DevKit presets
- Modern React patterns (hooks, suspense, concurrent features)

### Negative

- Full page reload on navigation (not SSR)
- SEO not applicable (not needed for internal tool)
- Initial load slightly heavier than SSR (acceptable for internal use)

### Alternatives Considered

- **Next.js**: Overkill for internal dashboard, adds complexity
- **CRA**: Deprecated, webpack is slower than Vite
- **Webpack**: More configuration, slower dev experience

## Implementation

- Root: `apps/studio` React SPA
- Build: Vite with DevKit preset
- Routing: React Router v6
- State: TanStack Query + Zustand
- Styling: Tailwind CSS with design tokens

## References

- [Vite Documentation](https://vitejs.dev/)
- [React Router v6](https://reactrouter.com/)
- [KB Labs DevKit](../devkit/README.md)

