// Package cmd implements the kb-deploy CLI commands.
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// Global flags accessible to all subcommands.
var (
	jsonMode   bool
	configPath string
)

// SetVersionInfo is called from main.go with values injected at build time via -ldflags.
func SetVersionInfo(version, commit, date string) {
	rootCmd.SetVersionTemplate(fmt.Sprintf(
		"kb-deploy %s (commit %s, built %s)\n", version, commit, date,
	))
	rootCmd.Version = version
}

var rootCmd = &cobra.Command{
	Use:   "kb-deploy",
	Short: "Deploy Docker services to VPS via affected changes",
	Long: `kb-deploy builds Docker images, pushes to a registry, and deploys
over SSH using docker compose. Affected targets are detected via git diff.

Commands:
  run      Build and deploy affected (or specified) targets
  status   Show last deployed SHA per target
  list     List configured targets

Examples:
  kb-deploy run                 # deploy affected targets (git diff HEAD~1)
  kb-deploy run --all           # deploy all targets
  kb-deploy run kb-labs-web     # deploy a specific target
  kb-deploy status              # show last deployed SHA per target
  kb-deploy list                # list configured targets`,
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
			_ = JSONOut(map[string]any{
				"ok":   false,
				"hint": err.Error(),
			})
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
