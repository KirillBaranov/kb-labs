// Package cmd implements the kb-monitor CLI commands.
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	jsonMode   bool
	configPath string
)

// SetVersionInfo is called from main.go with values injected at build time via -ldflags.
func SetVersionInfo(version, commit, date string) {
	rootCmd.SetVersionTemplate(fmt.Sprintf(
		"kb-monitor %s (commit %s, built %s)\n", version, commit, date,
	))
	rootCmd.Version = version
}

var rootCmd = &cobra.Command{
	Use:   "kb-monitor",
	Short: "Remote observability for deployed services",
	Long: `kb-monitor observes services deployed via kb-deploy.
Reads the same .kb/deploy.yaml configuration.

Commands:
  health   Check service health status
  status   Show running state, uptime, and image SHA
  logs     Fetch or stream service logs
  exec     Execute a command inside a container

Examples:
  kb-monitor health
  kb-monitor health kb-labs-web
  kb-monitor status --json
  kb-monitor logs kb-labs-web --lines 100
  kb-monitor logs kb-labs-web --follow
  kb-monitor exec kb-labs-web -- df -h`,
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute is the main entry point called from main.go.
func Execute() {
	err := rootCmd.Execute()
	if err == nil {
		return
	}
	if jsonMode {
		if err.Error() != "" {
			_ = JSONOut(map[string]any{"ok": false, "hint": err.Error()})
		}
	} else {
		out := newOutput()
		out.Err(err.Error())
	}
	os.Exit(1)
}

func init() {
	rootCmd.PersistentFlags().BoolVar(&jsonMode, "json", false, "output as structured JSON")
	rootCmd.PersistentFlags().StringVar(&configPath, "config", "", "path to deploy config file (default: .kb/deploy.yaml)")
}
