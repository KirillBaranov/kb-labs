# Contributing to kb-dev

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Go | 1.24+ | Compiler |
| golangci-lint | 2.x | Linter |
| goreleaser | 2.x | Cross-platform builds (optional) |

## Local Setup

```bash
git clone https://github.com/KirillBaranov/kb-labs-dev.git
cd kb-labs-dev

# Build
make build

# Run tests
make test

# Run linter
make lint
```

## Project Layout

```
cmd/              CLI commands (one file per command, cobra)
internal/
  config/         Config parsing and validation
  environ/        Node/pnpm path resolution and caching
  health/         Health check probes (HTTP, TCP, Command)
  process/        Process spawn, kill, PID file management
  service/        Service state machine and Runner interface
  manager/        Orchestration (start/stop/ensure/ready/watch)
  docker/         Docker/Colima availability
  logger/         Per-service log file management
docs/adr/         Architecture Decision Records
```

## Conventions

### Code Style

- Follow standard Go conventions (`gofmt`, `goimports`)
- All exported types and functions must have doc comments ending with a period
- Error messages: lowercase, no punctuation, use `fmt.Errorf("context: %w", err)` for wrapping
- No `//nolint` comments — configure the linter properly in `.golangci.yml` instead

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(manager): add graceful shutdown with configurable timeout
fix(health): handle IPv6 addresses in HTTP probes
refactor(process): extract shell command builder
docs: update agent protocol examples
```

### Adding a New CLI Command

1. Create `cmd/<name>.go` with a cobra command
2. Register it in `init()` with `rootCmd.AddCommand(<name>Cmd)`
3. Use `loadManager()` helper for commands that need config + services
4. Support `--json` flag: check `jsonMode` and use `JSONOut()` for structured output
5. Return `errSilent` after printing errors (prevents cobra from printing again)

### Adding a New Service Runner

1. Implement the `service.Runner` interface in a new file
2. The interface requires: `Start()`, `Stop()`, `IsRunning()`
3. Register the runner selection logic in `manager.go`

### Adding a New Health Probe Type

1. Add a new `ProbeType` constant in `health/probe.go`
2. Add classification logic in `ClassifyProbe()`
3. Add execution method on `Probe`
4. Return `Result` with `OK`, `Latency`, and `Error`

## Running Tests

```bash
# Unit tests (fast, no external deps)
make test

# Integration tests (needs Docker)
make integration

# Coverage report
make cover
```

Tests use table-driven patterns. Place `*_test.go` files next to the code they test.

## Building a Release

Releases are automated via GitHub Actions on tag push:

```bash
git tag v0.1.0
git push origin v0.1.0
# → goreleaser builds darwin/linux × amd64/arm64
```

For local testing:
```bash
make snapshot
ls dist/
```

## Submitting a Pull Request

1. Create a feature branch from `main`
2. Keep changes focused — one concern per PR
3. Run `make test && make lint` before pushing
4. Write a clear PR description with context
5. Reference related issues if any

## Reporting Issues

Include:
- kb-dev version (`kb-dev --version`)
- OS and architecture
- Output of `kb-dev doctor --json`
- Steps to reproduce
- Expected vs actual behavior
