package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/kb-labs/clikit/result"

	"github.com/kb-labs/create/internal/releases"
)

var swapCmd = &cobra.Command{
	Use:   "swap <service-pkg> <release-id>",
	Short: "Atomically point services/<service>/current at a release",
	Long: `swap atomically updates services/<service>/current to point at the given
release directory. The previously-current release (if any) becomes previous.

After swap you typically restart the service (via kb-dev) so it picks up the
new code from the updated symlink.

Examples:
  kb-create swap @kb-labs/gateway gateway-1.2.3-a3f2b1c9
  kb-create swap @kb-labs/rest-api rest-api-2.0.0-f1d8a2e3`,
	Args: cobra.ExactArgs(2),
	RunE: runSwap,
}

func init() {
	rootCmd.AddCommand(swapCmd)
}

func runSwap(cmd *cobra.Command, args []string) error {
	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}
	servicePkg, releaseID := args[0], args[1]

	warn, err := releases.Swap(platformDir, servicePkg, releaseID)
	if err != nil {
		return err
	}
	out := result.Success(
		fmt.Sprintf("swapped %s → %s", servicePkg, releaseID),
		map[string]any{"service": servicePkg, "release": releaseID},
	)
	if warn != nil {
		// A swapped-but-unregistered service is surfaced as a warning, never silent.
		out = out.WithWarnings(warn)
	}
	emit(cmd, out, outputMode())
	return nil
}
