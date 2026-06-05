package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/kb-labs/clikit/result"

	"github.com/kb-labs/create/internal/releases"
)

var swapEnv []string

var swapCmd = &cobra.Command{
	Use:   "swap <service-pkg> <release-id>",
	Short: "Atomically point services/<service>/current at a release",
	Long: `swap atomically updates services/<service>/current to point at the given
release directory. The previously-current release (if any) becomes previous.

After swap you typically restart the service (via kb-dev) so it picks up the
new code from the updated symlink.

--env overrides the service's devservices.yaml env (over the manifest defaults).
A PORT override also retargets the health-check port. Repeat the flag or pass a
comma-separated list: --env PORT=3002 --env HOST=127.0.0.1.

Examples:
  kb-create swap @kb-labs/gateway gateway-1.2.3-a3f2b1c9
  kb-create swap @kb-labs/studio-app studio-app-2.94.0-abc --env PORT=3002`,
	Args: cobra.ExactArgs(2),
	RunE: runSwap,
}

func init() {
	swapCmd.Flags().StringArrayVar(&swapEnv, "env", nil,
		"override devservices env as KEY=VALUE (repeatable; comma-separated allowed)")
	rootCmd.AddCommand(swapCmd)
}

// parseEnvOverrides turns ["PORT=3002", "A=1,B=2"] into a map. Values may
// themselves contain '=' (only the first splits key/value).
func parseEnvOverrides(items []string) (map[string]string, error) {
	if len(items) == 0 {
		return nil, nil
	}
	out := map[string]string{}
	for _, item := range items {
		for _, kv := range strings.Split(item, ",") {
			kv = strings.TrimSpace(kv)
			if kv == "" {
				continue
			}
			eq := strings.Index(kv, "=")
			if eq < 1 {
				return nil, fmt.Errorf("--env expects KEY=VALUE, got %q", kv)
			}
			out[strings.TrimSpace(kv[:eq])] = kv[eq+1:]
		}
	}
	return out, nil
}

func runSwap(cmd *cobra.Command, args []string) error {
	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}
	servicePkg, releaseID := args[0], args[1]

	envOverrides, err := parseEnvOverrides(swapEnv)
	if err != nil {
		return err
	}

	warn, err := releases.Swap(platformDir, servicePkg, releaseID, envOverrides)
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
