package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/kb-labs/clikit/result"

	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/releases"
	"github.com/kb-labs/create/v2/lifecycle"
)

var rollbackSnapshot string

var rollbackCmd = &cobra.Command{
	Use:   "rollback <service-pkg>",
	Short: "Swap current back to previous",
	Long: `rollback atomically swaps services/<service>/current to whatever previous
points at. Fails with an actionable error when previous is absent — this is the
case on a first install, or after a GC window past deeper rollback support.

For deeper rollback, use 'kb-create swap <service> <older-release-id>' against
an id listed by 'kb-create releases <service>' (ADR-0014 §GC).

Examples:
  kb-create rollback @kb-labs/gateway`,
	Args: func(_ *cobra.Command, args []string) error {
		if rollbackSnapshot != "" && len(args) == 0 {
			return nil
		}
		if rollbackSnapshot == "" && len(args) == 1 {
			return nil
		}
		return fmt.Errorf("pass a service package, or use --snapshot <id>")
	},
	RunE: runRollback,
}

func init() {
	rootCmd.AddCommand(rollbackCmd)
	rollbackCmd.Flags().StringVar(&rollbackSnapshot, "snapshot", "", "restore a V2 platform snapshot by ID")
}

func runRollback(cmd *cobra.Command, args []string) error {
	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}
	if rollbackSnapshot != "" {
		log, err := logger.NewFileOnly(platformDir)
		if err != nil {
			return fmt.Errorf("create rollback log: %w", err)
		}
		rememberRunLog(log)
		defer func() { _ = log.Close() }()
		_, err = lifecycle.Rollback(platformDir, rollbackSnapshot, func() error {
			if _, statErr := os.Stat(filepath.Join(platformDir, "package.json")); os.IsNotExist(statErr) {
				return nil
			}
			return (&installer.Installer{PM: pm.Detect(), Log: log}).RepairNodeModules(platformDir)
		})
		if err != nil {
			return fmt.Errorf("restore platform snapshot: %w", err)
		}
		emit(cmd, result.Success("restored platform snapshot "+rollbackSnapshot, map[string]any{"snapshot": rollbackSnapshot}), outputMode())
		return nil
	}
	servicePkg := args[0]

	warn, err := releases.Rollback(platformDir, servicePkg)
	if err != nil {
		return err
	}
	out := result.Success(
		fmt.Sprintf("rolled back %s to previous release", servicePkg),
		map[string]any{"service": servicePkg},
	)
	if warn != nil {
		out = out.WithWarnings(warn)
	}
	emit(cmd, out, outputMode())
	return nil
}
