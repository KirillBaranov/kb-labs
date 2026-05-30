package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/kb-labs/clikit/result"

	"github.com/kb-labs/create/internal/releases"
)

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
	Args: cobra.ExactArgs(1),
	RunE: runRollback,
}

func init() {
	rootCmd.AddCommand(rollbackCmd)
}

func runRollback(cmd *cobra.Command, args []string) error {
	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
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
