# Contributing to kb-create

Thanks for your interest in contributing! This document covers the development workflow, project conventions, and how to submit changes.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Go | 1.21+ | Build and test |
| Node.js | 18+ | Testing npm install behaviour |
| pnpm | optional | Testing pnpm install behaviour |
| goreleaser | optional | Cross-platform release builds |

## Local Setup

```bash
# Clone the repository
git clone https://github.com/KirillBaranov/kb-labs-create
cd kb-labs-create

# Download dependencies
go mod download

# Build
go build -o kb-create .

# Run
./kb-create --help
```

## Project Layout

```
cmd/                  CLI commands (cobra). One file per command.
internal/manifest/    Manifest types, embedded JSON, loader with fallback chain.
internal/pm/          PackageManager interface + npm/pnpm implementations.
internal/wizard/      Bubble Tea TUI — wizard stages and rendering.
internal/installer/   Install and update orchestration.
internal/config/      PlatformConfig read/write.
internal/logger/      Dual-output logger (stderr + file).
```

All business logic lives in `internal/`. The `cmd/` layer only parses flags, calls `internal/` functions, and formats output.

## Conventions

### Code style

- Follow standard Go conventions (`gofmt`, `go vet`).
- Every exported symbol must have a doc comment.
- Error strings are lowercase and do not end with punctuation (Go convention).
- Prefer explicit error returns over `panic`.

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add homebrew tap support
fix(wizard): correct tab navigation between inputs
docs: update installation instructions
refactor(pm): extract shared run() helper
chore: bump bubbletea to v1.4.0
```

### Adding a new package manager

1. Create `internal/pm/<name>.go` implementing `pm.PackageManager`.
2. Add detection logic to `pm.Detect()` in `internal/pm/pm.go`.
3. Update the FAQ in `README.md`.

### Adding a new manifest section

1. Add the new struct to `internal/manifest/types.go`.
2. Add the field to `Manifest` with a `json` tag.
3. Update `internal/manifest/manifest.json`.
4. Handle the new field in `internal/installer/installer.go`.

### Changing the config schema

1. Increment `configVersion` constant in `internal/config/config.go`.
2. Add a migration case in `config.Read()` (switch on `cfg.Version`).
3. Update `config.NewConfig()` to populate the new field.

## Running Tests

```bash
go test ./...
```

Tests are table-driven and live alongside the code they test (`*_test.go`).

## Building a Release

Releases are built automatically via goreleaser on GitHub Actions when a tag is pushed:

```bash
git tag v0.2.1
git push origin v0.2.1
```

To test the release build locally:

```bash
goreleaser build --snapshot --clean
```

Binaries appear in `dist/`.

## Submitting a Pull Request

1. Fork the repository and create a branch: `git checkout -b feat/my-feature`
2. Make your changes, ensuring `go vet ./...` passes.
3. Write or update tests if applicable.
4. Commit with a conventional commit message.
5. Push and open a PR against `main`.

Please keep PRs focused — one logical change per PR makes review easier.

## Reporting Issues

Use [GitHub Issues](https://github.com/KirillBaranov/kb-labs-create/issues). Include:
- `kb-create --version` output
- OS and architecture (`uname -sm`)
- Full command you ran
- Complete error output
