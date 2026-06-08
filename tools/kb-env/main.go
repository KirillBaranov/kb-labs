// kb-env provisions isolated, installed KB Labs platform environments from
// declarative profiles. It orchestrates kb-create (install) and kb-dev
// (services) — it does not reimplement them.
package main

import "github.com/kb-labs/env/cmd"

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	cmd.SetVersionInfo(version, commit, date)
	cmd.Execute()
}
