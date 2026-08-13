// Package cmd implements the kb-create CLI commands.
package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/kb-labs/clikit/result"
	"github.com/kb-labs/clikit/ui"
)

// Global output-mode flags.
var (
	jsonMode   bool
	agentMode  bool
	outputFlag string
	// agentProtocolFailed is set after a valid machine response has already
	// been written. Execute must preserve that single JSON envelope and only
	// set the process exit status instead of rendering a second diagnostic.
	agentProtocolFailed bool
)

// outputMode resolves the active render mode from the output flags.
func outputMode() result.Mode { return result.ResolveMode(jsonMode, agentMode, outputFlag) }

// emit renders a successful/warning CommandOutput. Human mode prints the
// message and any warnings (with reason+hint) visibly; machine modes write the
// JSON/agent envelope (warnings included).
func emit(cmd *cobra.Command, out result.CommandOutput, mode result.Mode) {
	if mode != result.ModeHuman {
		result.Render(cmd.OutOrStdout(), out, mode)
		return
	}
	o := ui.New(cmd.OutOrStdout())
	if out.Human != "" {
		if out.Ok {
			o.OK(out.Human)
		} else {
			o.Info(out.Human)
		}
	}
	for _, w := range out.Warnings {
		o.Warn(w.Message)
		if w.Reason != "" {
			o.Detail("why:  " + w.Reason)
		}
		if w.Hint != "" {
			o.Detail("hint: " + w.Hint)
		}
	}
}

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
	RunE:          runCreate,
	Args:          cobra.MaximumNArgs(1),
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute is the main entry point called from main.go. Command errors are
// rendered as structured diagnostics (message+reason+hint for humans;
// {ok:false,error:{…}} for machines) and the process exits with the
// diagnostic's exit code. Bare errors are wrapped as ERR_UNKNOWN.
func Execute() {
	_, err := rootCmd.ExecuteC()
	if err == nil {
		if agentProtocolFailed {
			os.Exit(1)
		}
		return
	}
	d := classifyError(err)
	if outputMode() == result.ModeHuman {
		if err.Error() == "installation cancelled" {
			fmt.Fprintln(os.Stderr, "Installation cancelled.")
			os.Exit(1)
		}
		printFatalDiagnostic(d, rootCmd.Version)
		if failureLogPath != "" {
			printSupportHint(failureLogPath)
		}
		os.Exit(1)
	}
	code := result.RenderDiag(os.Stdout, os.Stderr, d, outputMode())
	os.Exit(code)
}

func init() {
	rootCmd.PersistentFlags().String("platform", "", "platform installation directory (overrides wizard default)")
	rootCmd.PersistentFlags().BoolVar(&jsonMode, "json", false, "output as structured JSON")
	rootCmd.PersistentFlags().BoolVar(&agentMode, "agent", false, "output as compact agent JSON")
	rootCmd.PersistentFlags().StringVar(&outputFlag, "output", "", "output format: human|json|agent")
}
