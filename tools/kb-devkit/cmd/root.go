// Package cmd implements the kb-devkit CLI commands.
package cmd

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// errSilent is a sentinel that suppresses double-printing in --json mode.
// Commands that already emitted their own JSON envelope return this error
// so Execute() knows not to print an additional error envelope.
var errSilent = errors.New("")

// Global flags accessible to all subcommands.
var (
	jsonMode   bool
	configPath string
	depthFlag  int // 0 = use devkit.yaml value or default
)

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

// Execute is the main entry point called from main.go.
func Execute() {
	err := rootCmd.Execute()
	if err == nil {
		return
	}
	// errSilent: command already printed its own JSON envelope.
	if err.Error() == "" {
		os.Exit(1)
	}
	if jsonMode {
		_ = JSONOut(map[string]any{
			"ok":   false,
			"hint": err.Error(),
		})
	} else {
		out := newOutput()
		out.Err(err.Error())
	}
	os.Exit(1)
}

func init() {
	rootCmd.PersistentFlags().BoolVar(&jsonMode, "json", false, "output as structured JSON")
	rootCmd.PersistentFlags().StringVar(&configPath, "config", "", "path to devkit.yaml (default: auto-discover)")
	rootCmd.PersistentFlags().IntVar(&depthFlag, "depth", 0, "max recursion depth for ** globs (overrides devkit.yaml maxDepth)")
}
