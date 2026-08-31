.PHONY: build test test-race test-install e2e e2e-release-smoke cover vet lint clean snapshot help

BINARY   := kb-create
VERSION  := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT   := $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
DATE     := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS  := -s -w \
	-X main.version=$(VERSION) \
	-X main.commit=$(COMMIT) \
	-X main.date=$(DATE)

## build: compile binary for current platform
build:
	go build -ldflags "$(LDFLAGS)" -o $(BINARY) .
	chmod +x $(BINARY)

## test: run fast unit tests plus the install.sh suite (skips network-bound e2e)
test: test-install
	go test -race -count=1 -short ./...

## test-install: exercise install.sh against a stubbed descriptor endpoint (offline)
# Wired into `test` deliberately. This suite spent the whole control-plane
# cutover asserting the behaviour of a script that had already been replaced,
# because nothing ran it; install.sh is the one artifact every user executes and
# it must not be the one artifact with an unrun test.
test-install:
	bash install_test.sh

## e2e: run full end-to-end suite (installs platform from npm — requires network)
e2e:
	go test -v -race -count=1 -timeout 35m $(if $(E2E_RUN),-run "$(E2E_RUN)",) ./v2/e2e/...

## e2e-release-smoke: bounded public-artifact promotion gate
e2e-release-smoke:
	go test -v -race -count=1 -timeout 12m -run '^TestPublishedV2JourneyReachesPluginWorkflow$$' ./v2/e2e/...

## cover: run tests and open coverage report in browser (skips network-bound e2e — use `make e2e` separately)
cover:
	go test -race -count=1 -short -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

## vet: run go vet
vet:
	go vet ./...

## lint: run golangci-lint (requires golangci-lint installed)
lint:
	golangci-lint run ./...

## snapshot: build all platform binaries via goreleaser (no publish)
snapshot:
	goreleaser build --snapshot --clean

## clean: remove build artifacts
clean:
	rm -f $(BINARY) $(BINARY)-*
	rm -f coverage.out coverage.html
	rm -rf dist/

## help: list available targets
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
