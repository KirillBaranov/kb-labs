.PHONY: build test test-race cover vet lint clean snapshot help

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

## test: run tests with race detector
test:
	go test -race -count=1 ./...

## cover: run tests and open coverage report in browser
cover:
	go test -race -count=1 -coverprofile=coverage.out ./...
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
