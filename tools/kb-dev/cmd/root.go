// Package cmd implements the kb-dev CLI commands.
package cmd

import (
	"fmt"
	"os"

	"github.com/kb-labs/dev/internal/config"
	"github.com/kb-labs/dev/internal/manager"
	"github.com/spf13/cobra"
)

// Global flags accessible to all subcommands.
var (
	jsonMode   bool
	forceFlag  bool
	configPath string
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

Examples:
  kb-dev start                    start all services
  kb-dev start infra              start infrastructure group
  kb-dev ensure rest gateway      ensure rest and gateway are alive
  kb-dev status --json            machine-readable status
  kb-dev watch --json             stream events as JSONL`,
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute is the main entry point called from main.go.
//
// In --json mode, any error that bubbles up to the root command is
// emitted as a manager.Result envelope on stdout, so consumers always
// get parseable JSON. Without this, a failed `kb-dev status --json`
// would silently exit 1 with zero output — breaking any agent or UI
// that expects a well-formed response.
//
// Commands that already emit their own JSON envelope (e.g. status,
// doctor) must NOT return their errSilent sentinel in --json mode;
// they should return nil after printing their own envelope.
func Execute() {
	err := rootCmd.Execute()
	if err == nil {
		return
	}
	if jsonMode {
		// errSilent means the command already printed its own envelope.
		// Any other error means nothing was printed, so we emit one here.
		if err.Error() != "" {
			_ = JSONOut(manager.Result{
				OK:   false,
				Hint: err.Error(),
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
	rootCmd.PersistentFlags().BoolVar(&forceFlag, "force", false, "kill port conflicts before starting")
	rootCmd.PersistentFlags().StringVar(&configPath, "config", "", "path to devservices.yaml (default: .kb/devservices.yaml)")

	// Cascade flags — mutually exclusive.
	rootCmd.PersistentFlags().Bool("cascade", false, "cascade to dependent services")
	rootCmd.PersistentFlags().Bool("no-cascade", false, "skip dependent cascade")
}

// FindConfigPath resolves the config file path.
// Priority: --config flag > config.Discover (walks up from cwd).
func FindConfigPath() (string, error) {
	if configPath != "" {
		if _, err := os.Stat(configPath); err != nil {
			return "", fmt.Errorf("config not found: %s", configPath)
		}
		return configPath, nil
	}

	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("cannot determine working directory: %w", err)
	}

	return config.Discover(dir)
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
