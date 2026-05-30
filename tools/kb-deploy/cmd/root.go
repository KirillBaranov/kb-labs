// Package cmd implements the kb-deploy CLI commands.
package cmd

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/clikit/result"
)

// Global flags accessible to all subcommands.
var (
	jsonMode   bool
	agentMode  bool
	outputFlag string
	configPath string
)

// outputMode resolves the active render mode from the output flags.
func outputMode() result.Mode {
	return result.ResolveMode(jsonMode, agentMode, outputFlag)
}

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

// Execute is the main entry point called from main.go. Any error returned by a
// command is rendered as a structured diagnostic (message + reason + hint for
// humans; {ok:false,error:{…}} for machines) and the process exits with the
// diagnostic's exit code. Bare errors are wrapped as ERR_UNKNOWN so nothing is
// ever uncoded.
func Execute() {
	_, err := rootCmd.ExecuteC()
	if err == nil {
		return
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
	rootCmd.PersistentFlags().StringVar(&configPath, "config", "", "path to deploy config file (default: .kb/deploy.yaml)")

	// Bridge: commands that still branch on jsonMode also fire for --agent and
	// --output=json|agent until they are individually converted to emit a
	// CommandOutput.
	rootCmd.PersistentPreRun = func(_ *cobra.Command, _ []string) {
		switch outputMode() {
		case result.ModeJSON, result.ModeAgent:
			jsonMode = true
		}
	}
}
