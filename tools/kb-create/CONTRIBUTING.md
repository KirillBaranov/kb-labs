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

The public launcher lives under `v2/`: `remote` speaks the published
descriptor protocol (channel pointer → immutable release descriptor → release
index), `catalog` owns the resulting index, `resolve` creates the immutable
plan, `runtime` applies and recovers it, and `cmd/kb-create-v2` exposes the
human/agent/CI transports. Publisher-only sealing lives in
`v2/cmd/kb-create-release-index`.

`install.sh` beside this file is the public bootstrap and speaks the same
protocol; `install_test.sh` exercises it offline against a stubbed endpoint and
runs as part of `make test`. There is no `install.ps1`: Windows is off the
support matrix (decision S0.3c).

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

The launcher is released as part of the platform release train, not on its own.
The release plugin seals one immutable bundle containing the release index, the
npm tarballs, the launcher binaries and the sealed channel pointer; a human
approves that bundle's digest; CI publishes exactly those bytes. A launcher
binary has no independent release path and no independent version negotiation.

Drive it with `kb release candidate` and approve it with `kb release approve`.
See the [release control plane runbook](../../docs/runbooks/release-control-plane.md)
for the operator procedure and for what currently still needs infrastructure
that is not deployed.

Do not publish a platform or binary with a separate compatibility file or an
ad-hoc latest-version lookup: the sealed index inside the bundle is the
compatibility authority the launcher consumes.

Local binary builds are development-only. Production launcher binaries come out
of the sealed bundle and must never be replaced by a local GoReleaser build.

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
