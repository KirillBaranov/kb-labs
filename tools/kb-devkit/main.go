// kb-devkit is a workspace quality manager for Node.js and Go monorepos.
package main

import "github.com/kb-labs/devkit/cmd"

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	cmd.SetVersionInfo(version, commit, date)
	cmd.Execute()
}
