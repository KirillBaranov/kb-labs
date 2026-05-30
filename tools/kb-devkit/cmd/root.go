// Package cmd implements the kb-devkit CLI commands.
package cmd

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/clikit/result"
)

// errSilent is a sentinel that suppresses double-printing in --json mode.
// Commands that already emitted their own JSON envelope return this error
// so Execute() knows not to print an additional error envelope.
var errSilent = errors.New("")

// Global flags accessible to all subcommands.
var (
	jsonMode   bool
	agentMode  bool
	outputFlag string
	configPath string
	depthFlag  int // 0 = use devkit.yaml value or default
)

// outputMode resolves the active render mode from the output flags.
func outputMode() result.Mode { return result.ResolveMode(jsonMode, agentMode, outputFlag) }

// SetVersionInfo is called from main.go with values injected at build time via -ldflags.
func SetVersionInfo(version, commit, date string) {
	rootCmd.SetVersionTemplate(fmt.Sprintf(
		"kb-devkit %s (commit %s, built %s)\n", version, commit, date,
	))
	rootCmd.Version = version
}

var rootCmd = &cobra.Command{
	Use:   "kb-devkit",
	Short: "Workspace quality manager for Node.js and Go monorepos",
	Long: `kb-devkit is a workspace orchestrator for Node.js and Go monorepos.
Content-addressable task caching, affected-package detection, and quality
checks — declaratively configured via devkit.yaml and reusable YAML packs.

Commands:
  run      <task> [task2 ...] [--affected] [--no-cache] [--json]
  init     create a starter devkit.yaml
  check    [--package X] [--json]
  fix      [--package X] [--dry-run] [--safe|--scaffold|--sync|--all] [--json]
  stats    workspace health score
  status   [--json]
  watch    [--json]
  gate     pre-commit check on staged files
  sync     [--check] [--dry-run] [--json]
  doctor   [--json]

Examples:
  kb-devkit init                              create a minimal devkit.yaml
  kb-devkit run build                         build all packages (cached)
  kb-devkit run build lint test --affected    only changed packages
  kb-devkit check --json                      machine-readable check results
  kb-devkit fix --scaffold --json             create missing deterministic files
  kb-devkit stats                             workspace health score`,
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute is the main entry point called from main.go. Errors bubbling up to
// the root are rendered as structured diagnostics (message+reason+hint for
// humans; {ok:false,error:{…}} for machines) and the process exits with the
// diagnostic's exit code. Bare errors are wrapped as ERR_UNKNOWN; the errSilent
// sentinel (empty message) means the command already printed its own output.
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
	rootCmd.PersistentFlags().StringVar(&configPath, "config", "", "path to devkit.yaml (default: auto-discover)")
	rootCmd.PersistentFlags().IntVar(&depthFlag, "depth", 0, "max recursion depth for ** globs (overrides devkit.yaml maxDepth)")

	// Bridge: commands that branch on jsonMode also fire for --agent and
	// --output=json|agent until individually converted to emit CommandOutput.
	rootCmd.PersistentPreRun = func(_ *cobra.Command, _ []string) {
		switch outputMode() {
		case result.ModeJSON, result.ModeAgent:
			jsonMode = true
		}
	}
}
