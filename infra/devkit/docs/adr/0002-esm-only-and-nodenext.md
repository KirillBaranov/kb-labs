# ADR-0002: ESM-only and NodeNext Module Resolution

**Date:** 2025-09-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, architecture]

## Context
Historically, Node.js supported CommonJS (CJS) as the default module format.  
However, the modern JavaScript ecosystem (TypeScript, Vite, Vitest, tsup, ESLint 9) increasingly standardizes on **ESM** as the primary module format.  

During early iterations of KB Labs projects, mixed usage of CJS configs (`*.cjs`) and legacy `moduleResolution` options caused:
- Confusion when importing configs across workspaces
- Incompatibility with tooling like Vitest and tsup
- Extra duplication in TypeScript configs

To simplify maintenance and align with ecosystem trends, we decided to adopt a strict **ESM-only** policy across all packages and tooling.

## Decision
- All KB Labs repositories, packages, and templates are **ESM-only**:
  - `"type": "module"` is set in every `package.json`
  - Build output from tsup uses **ESM only** (`format: ['esm']`)
- TypeScript configs explicitly use:
  - `"module": "NodeNext"`
  - `"moduleResolution": "NodeNext"`
- All reusable presets in `@kb-labs/devkit` are provided as `.js` ESM files:
  - ESLint presets → `eslint/*.js` (flat config, ESLint 9)
  - Vitest presets → `vitest/*.js`
  - Tsup presets → `tsup/*.js`
- CJS files and legacy `.cjs` configs are no longer supported.
- Consumers extend via:
  ```json
  {
    "extends": "@kb-labs/devkit/tsconfig/node.json"
  }
```

## Rationale
- **Ecosystem alignment** → modern tooling (TypeScript, Vite, Vitest, tsup, ESLint 9) standardizes on ESM
- **Simplified maintenance** → single module format eliminates configuration complexity
- **Future-proofing** → ESM is the clear direction for JavaScript/TypeScript ecosystem

## Consequences
**Pros**
- Unified tooling: no more mixing CJS/ESM configs
- Works out of the box with modern Node.js and TS toolchains
- Easier maintenance: one config format for all

**Cons**
- Requires Node.js 20+ in all environments
- Some older ecosystem tools may not support ESM-only; such tools are not supported in KB Labs projects

## Alternatives Considered
- Dual CJS + ESM builds: rejected due to complexity and limited value
- Stick with CommonJS: rejected, as ecosystem momentum is clearly towards ESM

## References
- Node.js Docs: ECMAScript Modules
- TypeScript Docs: Module Resolution
- KB Labs DevKit: @kb-labs/devkit
