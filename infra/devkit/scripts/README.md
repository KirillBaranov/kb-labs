# Scripts

## `fixtures.js` - Fixtures Management

Manages all DevKit fixtures for testing presets across different project types.

### Usage

```bash
# Show help
node scripts/fixtures.js

# Run action for specific fixture
node scripts/fixtures.js <fixture> <action>

# Run action for all fixtures
node scripts/fixtures.js all <action>

# Via pnpm (recommended)
pnpm fixtures <fixture> <action>
pnpm fixtures:check  # all fixtures, check
pnpm fixtures:lint   # all fixtures, lint
pnpm fixtures:test   # all fixtures, test
pnpm fixtures:build  # all fixtures, build
```

### Fixtures

- `lib` - Simple library (Node.js)
- `cli` - CLI application with Commander.js
- `web` - Web application with DOM API
- `monorepo` - Monorepo with shared + app packages

### Actions

- `bootstrap` - Install dependencies
- `clean` - Clean dist
- `lint` - Run ESLint
- `type-check` - Run TypeScript checks
- `test` - Run tests
- `build` - Build project
- `check` - Full validation (lint + type-check + test + build)

### Examples

```bash
# Check only CLI fixture
pnpm fixtures cli check

# Run tests for all fixtures
pnpm fixtures:test

# Build only web fixture
pnpm fixtures web build

# Check monorepo
pnpm fixtures monorepo check
```

### Special Features

- **CLI fixture**: Build happens before tests (required for CLI testing)
- **Monorepo fixture**: Uses `pnpm -r` for recursive command execution
- **All fixtures**: Executed sequentially with detailed output
