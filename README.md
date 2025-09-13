# KB Labs — Product Template

This is the **baseline template** for products under the **@kb-labs** namespace.  
It is designed for multi-package repositories using pnpm workspaces.  

**Goals:** Fast bootstrap, unified quality rules, simple publishing, and reusable core.

## 📁 Repository Structure

```
apps/
├── demo/                    # Example app / playground
packages/
├── package-name/            # Example package (lib/cli/adapter)
fixtures/                    # Fixtures for snapshot/integration testing
docs/
└── adr/                     # Architecture Decision Records (ADRs)
```

## 🚀 Quick Start

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev         # Parallel dev mode for selected packages/apps
pnpm build       # Build all packages
pnpm test        # Run tests
pnpm lint        # Lint code
```

### Creating a New Package

```bash
# Using the CLI tool (recommended)
pnpm dlx @kb-labs/create-pkg my-new-pkg

# Or manually copy and modify
cp -r packages/package-name packages/<new-package-name>
# Then update metadata and imports
```

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development mode for all packages |
| `pnpm build` | Build all packages |
| `pnpm build:clean` | Clean and build all packages |
| `pnpm test` | Run all tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Lint all code |
| `pnpm lint:fix` | Fix linting issues |
| `pnpm type-check` | TypeScript type checking |
| `pnpm check` | Run lint, type-check, and tests |
| `pnpm ci` | Full CI pipeline (clean, build, check) |
| `pnpm clean` | Clean build artifacts |
| `pnpm clean:all` | Clean all node_modules and build artifacts |

## 📋 Development Policies

- **Code Style:** ESLint + Prettier, TypeScript strict mode
- **Testing:** Vitest with fixtures for integration testing
- **Versioning:** SemVer with automated releases through Changesets
- **Architecture:** Document decisions in ADRs (see `docs/adr/`)

## 🔧 Requirements

- **Node.js:** >= 18.18.0
- **pnpm:** >= 9.0.0

## 📄 License

MIT © KB Labs