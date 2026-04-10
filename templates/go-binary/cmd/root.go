// Package cmd implements the {{.ShortName}} CLI commands.
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
		"{{.ShortName}} %s (commit %s, built %s)\n", version, commit, date,
	))
	rootCmd.Version = version
}

var rootCmd = &cobra.Command{
	Use:   "{{.ShortName}}",
	Short: "Short description of {{.ShortName}}",
	Long: `Long description of {{.ShortName}}.

Commands:
  example    example command

Examples:
  {{.ShortName}} example`,
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
	rootCmd.PersistentFlags().StringVar(&configPath, "config", "", "path to config file")
}
