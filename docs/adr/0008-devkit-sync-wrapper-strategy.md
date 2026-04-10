# ADR-0008: DevKit Sync Wrapper Strategy in Product Template

**Date:** 2025-09-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [tooling, process]

## Context

For proper operation of projects created from @kb-labs/product-template, synchronization of certain artifacts from @kb-labs/devkit is required (e.g., agents, .cursorrules, VS Code settings).

Previously, it was assumed to use the kb-devkit-sync binary directly or call a local script from devkit, but this approach complicated migrations and required additional configuration.

The main goal is to minimize friction when starting a new project and ensure stability of the synchronization mechanism regardless of the developer environment.

## Decision

Wrapper npm scripts will be added to the product-template:

```json
"scripts": {
  "devkit:sync": "kb-devkit-sync",
  "devkit:check": "kb-devkit-sync --check",
  "postinstall": "pnpm -s devkit:sync || true"
}
```

This approach provides:
- Calls are made through package.json without the need to manually install the binary
- postinstall automatically pulls artifacts when installing dependencies
- devkit:check allows running drift checks in CI

## Consequences

### Positive

- **Simplicity**: Users run `pnpm devkit:sync` without knowledge of internal implementation
- **Automation**: Synchronization happens on every `pnpm install`
- **Error reduction**: Single approach for all projects created from the template

### Negative

- **Hard dependency**: Tight coupling to the presence of kb-devkit-sync binary in @kb-labs/devkit
- **Migration risk**: If the binary is renamed or API changes, all template-based projects will need updates

### Alternatives Considered

- **Local script in each project** (bin/devkit-sync.mjs): More control but requires duplication and manual maintenance
- **Direct devkit API calls**: More complex for consumers, increases risk of configuration drift
- **No automatic sync**: Consumers would have to manually copy files → too high cost of errors

## Implementation

- The described scripts have been added to the template's package.json
- postinstall ensures auto-synchronization after dependency installation
- CI pipelines will use `pnpm devkit:check` for drift verification

Future steps:
- If an alternative implementation emerges (e.g., REST API or new CLI utility), an ADR-supersede can be created
- Sync logic will be documented in the template's README for new users

## References

- [DevKit Repository](https://github.com/kb-labs/devkit) <!-- TODO: Replace with actual URL -->
- [Product Template Repository](https://github.com/kb-labs/product-template) <!-- TODO: Replace with actual URL -->
- [Related ADR: ADR-0005: Use DevKit for Shared Tooling](./0005-use-devkit-for-shared-tooling.md)