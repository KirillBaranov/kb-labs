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
git clone https://github.com/kb-labs-team/kb-labs
cd kb-labs-create

# Download dependencies
go mod download

# Build
go build -o kb-create .

# Run
./kb-create --help
```

## Project Layout

The public launcher lives under `v2/`: `catalog` owns the sealed
release-index, `resolve` creates the immutable plan, `runtime` applies and
recovers it, and `cmd/kb-create-v2` exposes the human/agent/CI transports.
Publisher-only sealing lives in `v2/cmd/kb-create-release-index`.

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

### Changing a launcher contract

Update the V2 contract package, catalog validation, resolver and the shared
Human/Agent/CI tests together. Do not add a second installer path, manifest
format or package-manager owner.

## Running Tests

```bash
go test ./...
```

Tests are table-driven and live alongside the code they test (`*_test.go`).

## Building a Release

The release train publishes one sealed `release-index.json` together with the
platform, SDK and binary artifacts. The index is prepared from the exact
staged package manifests and binary checksum manifest; it is the compatibility
authority consumed by the launcher. Do not publish a platform or binary with a
separate compatibility file or an ad-hoc latest-version lookup.

Releases are built automatically via GitHub Actions when a release tag is pushed:

```bash
git tag v0.2.1
git push origin v0.2.1
```

To test a binary build locally:

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

Use [GitHub Issues](https://github.com/kb-labs-team/kb-labs/issues). Include:
- `kb-create --version` output
- OS and architecture (`uname -sm`)
- Full command you ran
- Complete error output
