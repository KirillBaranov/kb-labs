## [1.1.0] - 2026-03-24

**5 packages** bumped to v1.1.0

| Package | Previous | Bump |
|---------|----------|------|
| `@kb-labs/perm-presets` | 1.0.0 | minor |
| `@kb-labs/shared-command-kit` | 1.0.0 | minor |
| `@kb-labs/shared-tool-kit` | 1.0.0 | minor |
| `@kb-labs/shared-cli-ui` | 1.0.0 | minor |
| `@kb-labs/shared-testing` | 1.0.0 | minor |

### ✨ New Features

- **config**: Introduces new configuration files for package management, allowing users to easily manage dependencies and ensure consistent environments across projects.
- **github**: Implements GitHub workflows for CI/CD, streamlining the development process and enabling quicker, more reliable software updates for users.

### 🐛 Bug Fixes

- **tests**: Improves code clarity by using an object type instead of a placeholder, which helps prevent misunderstandings in the codebase and enhances maintainability. Additionally, it resolves a linting issue that could lead to confusion when no value is returned from certain functions.