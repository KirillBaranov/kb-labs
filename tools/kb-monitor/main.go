// kb-monitor is a remote observability tool for deployed services.
package main

import "github.com/kb-labs/kb-monitor/cmd"

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	cmd.SetVersionInfo(version, commit, date)
	cmd.Execute()
}
