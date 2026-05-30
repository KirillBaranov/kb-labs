.PHONY: build test e2e cover vet lint clean help

# clikit is a library module (no binary), so `build` compiles every package
# rather than producing an executable. Targets mirror the other Go tools so the
# kb-devkit go-binary tasks (make build / make test / make e2e / go vet) work
# uniformly.

## build: compile all packages
build:
	go build ./...

## test: run tests with race detector
test:
	go test -race -count=1 ./...

## e2e: no-op (library has no e2e suite) — defined for devkit task uniformity
e2e:
	@echo "no e2e suite for clikit"

## cover: run tests and write a coverage report
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

## clean: remove build artifacts
clean:
	rm -f coverage.out coverage.html

## help: list available targets
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'
