// Package cmd implements the kb-dev CLI commands.
package cmd

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/clikit/result"
	"github.com/kb-labs/dev/internal/config"
	"github.com/spf13/cobra"
)

// outputMode resolves the active render mode from the output flags.
func outputMode() result.Mode { return result.ResolveMode(jsonMode, agentMode, outputFlag) }

// Global flags accessible to all subcommands.
var (
	jsonMode        bool
	agentMode       bool
	outputFlag      string
	forceFlag       bool
	configPath      string
	netOffset       int
	platformDirFlag string
	projectSelector string
	allProjects     bool
)

// SetVersionInfo is called from main.go with values injected at build time via -ldflags.
func SetVersionInfo(version, commit, date string) {
	rootCmd.SetVersionTemplate(fmt.Sprintf(
		"kb-dev %s (commit %s, built %s)\n", version, commit, date,
	))
	rootCmd.Version = version
}

var rootCmd = &cobra.Command{
	Use:   "kb-dev",
	Short: "Local service manager for KB Labs platform",
	Long: `kb-dev manages local development services for the KB Labs platform.

It reads service definitions from .kb/devservices.yaml and provides reliable
process management with health checks, dependency ordering, and auto-restart.

Commands:
  start [target]       Start services (all, group, or single service)
  stop [target]        Stop services
  restart [target]     Restart with dependent cascade
  status               Show service status table
  health               Run health probes
  logs <service>       View service logs
  doctor               Environment diagnostics
  ensure <targets>     Idempotent desired state (agent-friendly)
  ready <targets>      Block until services are alive (agent-friendly)
  watch                Stream service events (JSONL)
  register <alias>     Register a project so switch can find it from anywhere
  unregister <alias>   Remove a project alias
  projects             List registered projects and running state
  switch <alias>       Stop other registered projects and start <alias>

Examples:
  kb-dev start                    start all services
  kb-dev start infra              start infrastructure group
  kb-dev ensure rest gateway      ensure rest and gateway are alive
  kb-dev status --json            machine-readable status
  kb-dev watch --json             stream events as JSONL`,
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute is the main entry point called from main.go. Any error bubbling up to
// the root is rendered as a structured diagnostic (message+reason+hint for
// humans; {ok:false,error:{…}} for machines) and the process exits with the
// diagnostic's exit code. Bare errors are wrapped as ERR_UNKNOWN.
//
// Commands that already emitted their own envelope return the errSilent
// sentinel (empty message); Execute then exits without re-rendering.
func Execute() {
	_, err := rootCmd.ExecuteC()
	if err == nil {
		return
	}
	if err.Error() == "" {
		// errSilent: the command already printed its own output.
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
	rootCmd.PersistentFlags().BoolVar(&forceFlag, "force", false, "kill port conflicts before starting")
	rootCmd.PersistentFlags().StringVar(&configPath, "config", "", "path to devservices.yaml (default: .kb/devservices.yaml)")
	rootCmd.PersistentFlags().IntVar(&netOffset, "net-offset", 0, "shift all TCP ports by this amount (overrides KB_NET_OFFSET); for isolated parallel environments. Socket services untouched.")
	rootCmd.PersistentFlags().StringVar(&platformDirFlag, "platform-dir", "", "override the KB Labs platform directory (default: current project's platform.dir, then ~/.kb/active-platform)")
	rootCmd.PersistentFlags().StringVar(&projectSelector, "project", "", "target a registered project by alias or path (default: project in cwd)")
	rootCmd.PersistentFlags().BoolVar(&allProjects, "all", false, "inspect all known projects (fleet commands)")

	// Cascade flags — mutually exclusive.
	rootCmd.PersistentFlags().Bool("cascade", false, "cascade to dependent services")
	rootCmd.PersistentFlags().Bool("no-cascade", false, "skip dependent cascade")

	// Bridge: commands that branch on jsonMode also fire for --agent and
	// --output=json|agent until individually converted to emit CommandOutput.
	rootCmd.PersistentPreRun = func(_ *cobra.Command, _ []string) {
		switch outputMode() {
		case result.ModeJSON, result.ModeAgent:
			jsonMode = true
		}
	}
}

// FindConfig resolves the config file and project directory.
// Priority: --config flag > config.Discover (walks up from cwd).
// When --config is given explicitly, ProjectDir normally == RootDir(configPath)
// — the config file's own directory is assumed to be the project. That
// assumption breaks for the split platform/project topology (kb.config.jsonc
// "platform.dir", the same one config.Discover already special-cases for the
// no-flag path): there, an explicit --config almost always points at the
// separate platform's devservices.yaml, and callers rely on it (this repo's
// own CLAUDE.md mandates `--config` for kb-dev start/restart/ensure). If cwd
// is a project whose kb.config.jsonc platform.dir resolves to that same
// config's root, cwd is the real project — use it, so KB_PROJECT_ROOT (and
// anything else keyed off ProjectDir, e.g. per-project .kb/workflows
// discovery) resolves to the project, not the platform.
func FindConfig() (config.DiscoverResult, error) {
	if configPath != "" {
		if _, err := os.Stat(configPath); err != nil {
			return config.DiscoverResult{}, fmt.Errorf("config not found: %s", configPath)
		}
		rootDir := config.RootDir(configPath)
		projectDir := rootDir
		if cwd, err := os.Getwd(); err == nil {
			if platformDir := config.FindPlatformDir(cwd); platformDir != "" {
				if samePath(platformDir, rootDir) {
					projectDir = cwd
				}
			}
		}
		return config.DiscoverResult{ConfigPath: configPath, ProjectDir: projectDir}, nil
	}

	dir, err := os.Getwd()
	if err != nil {
		return config.DiscoverResult{}, fmt.Errorf("cannot determine working directory: %w", err)
	}

	return config.Discover(dir)
}

// samePath reports whether two paths resolve to the same location, ignoring
// trailing separators and symlink-insensitive formatting differences that
// filepath.Clean already normalizes (e.g. a path with vs. without a trailing
// slash). It deliberately does not resolve symlinks (EvalSymlinks) — both
// inputs here already come from filesystem walks (FindPlatformDir,
// config.RootDir) that produce consistent forms for the same directory.
func samePath(a, b string) bool {
	return filepath.Clean(a) == filepath.Clean(b)
}

// ShouldCascade returns the resolved cascade behavior.
// For restart: default true. For stop: default false.
func ShouldCascade(cmd *cobra.Command, defaultValue bool) bool {
	if f := cmd.Flag("no-cascade"); f != nil && f.Changed {
		return false
	}
	if f := cmd.Flag("cascade"); f != nil && f.Changed {
		return true
	}
	return defaultValue
}
