## [1.1.0] - 2026-03-22

**3 packages** bumped to v1.1.0

| Package | Previous | Bump |
|---------|----------|------|
| `@kb-labs/rest-api` | 1.0.0 | minor |
| `@kb-labs/rest-api-contracts` | 1.0.0 | minor |
| `@kb-labs/rest-api-core` | 1.0.0 | minor |

### Features

- **global**: internal adapter-call endpoint + AdapterRegistry

### Bug Fixes

- **adapter-call**: use correct logger.error signature (message, error, meta)
- **rest-api**: make incident storage optional when db adapter not configured