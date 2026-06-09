// Package cmd implements the kb-env CLI.
package cmd

import (
	"errors"
	"fmt"
	"os"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/clikit/result"
	"github.com/spf13/cobra"
)

var (
	jsonMode   bool
	agentMode  bool
	outputFlag string
)

func outputMode() result.Mode { return result.ResolveMode(jsonMode, agentMode, outputFlag) }

// SetVersionInfo is called from main.go with values injected at build time.
func SetVersionInfo(version, commit, date string) {
	rootCmd.SetVersionTemplate(fmt.Sprintf("kb-env %s (commit %s, built %s)\n", version, commit, date))
	rootCmd.Version = version
}

var rootCmd = &cobra.Command{
	Use:   "kb-env",
	Short: "Provision isolated, installed KB Labs environments from profiles",
	Long: `kb-env brings up an installed KB Labs platform (user-mode, not workspace)
from a declarative profile, leaves it live, and lets you work inside it.

It orchestrates kb-create (install) and kb-dev (services) — one environment at a
time, isolated in an external dir with a clean PATH, so it never collides with
your working dev server.

Commands:
  up <profile>      provision + start an environment from a profile
  shell             open a shell inside the live environment (clean PATH)
  exec -- <cmd>     run a command inside the live environment
  config <profile>  hot-swap config overlay (no reinstall)
  status            show the live environment's services
  profiles          list available profiles
  down              stop (and optionally remove) the environment`,
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute renders any error as a structured diagnostic and sets the exit code.
func Execute() {
	_, err := rootCmd.ExecuteC()
	if err == nil {
		return
	}
	if err.Error() == "" {
		os.Exit(1)
	}
	var d *diag.Diag
	if !errors.As(err, &d) {
		d = diag.Wrap(err, "ERR_UNKNOWN", err.Error())
	}
	code := result.RenderDiag(os.Stdout, os.Stderr, d, outputMode())
	os.Exit(code)
}

func init() {
	rootCmd.PersistentFlags().BoolVar(&jsonMode, "json", false, "output as structured JSON")
	rootCmd.PersistentFlags().BoolVar(&agentMode, "agent", false, "output as compact agent JSON")
	rootCmd.PersistentFlags().StringVar(&outputFlag, "output", "", "output format: human|json|agent")
}
