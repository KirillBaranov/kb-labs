// Package cmd implements the kb-create CLI commands.
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// SetVersionInfo is called from main.go with values injected at build time via -ldflags.
// It must be called before Execute().
func SetVersionInfo(version, commit, date string) {
	rootCmd.SetVersionTemplate(fmt.Sprintf(
		"kb-create %s (commit %s, built %s)\n", version, commit, date,
	))
	rootCmd.Version = version
}

var rootCmd = &cobra.Command{
	Use:   "kb-create [project-dir]",
	Short: "KB Labs platform installer",
	Long: `kb-create installs and manages the KB Labs platform.

Examples:
  kb-create my-project           interactive wizard
  kb-create my-project --yes     silent install with defaults
  kb-create update               update an installed platform
  kb-create status               show installation status
  kb-create logs                 show install log
  kb-create doctor               verify local environment`,
	RunE: runCreate,
	Args: cobra.MaximumNArgs(1),
}

// Execute is the main entry point called from main.go.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().String("platform", "", "platform installation directory (overrides wizard default)")
}
