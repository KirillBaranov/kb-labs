// kb-deploy is a CLI tool for the KB Labs platform.
package main

import "github.com/kb-labs/kb-deploy/cmd"

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	cmd.SetVersionInfo(version, commit, date)
	cmd.Execute()
}
