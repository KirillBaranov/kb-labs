package main

import (
	"os"

	v2cli "github.com/kb-labs/create/v2/cmd/kb-create-v2"
)

// Build-time variables injected by goreleaser / go build -ldflags.
var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	v2cli.SetVersionInfo(version, commit, date)
	os.Exit(v2cli.Execute())
}
