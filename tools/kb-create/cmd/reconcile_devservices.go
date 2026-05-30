package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/clikit/result"

	"github.com/kb-labs/create/internal/devservices"
)

var reconcileDevservicesCmd = &cobra.Command{
	Use:   "reconcile-devservices",
	Short: "Prune dependsOn entries that name services absent from devservices.yaml",
	Long: `reconcile-devservices makes <platform>/.kb/devservices.yaml self-consistent
for kb-dev's strict validation.

kb-create writes each service's full manifest dependencies on swap, one service
at a time, so the registry can transiently reference services that are external
(e.g. qdrant, which kb-dev does not manage) or not yet installed. Run this once,
after every service of a deployment is registered: real inter-service
dependencies are kept (their targets are present) while external/undeployed ones
are dropped, so kb-dev can load and start the services.

Examples:
  kb-create reconcile-devservices --platform /home/deploy/kb-platform`,
	Args: cobra.NoArgs,
	RunE: runReconcileDevservices,
}

func init() {
	rootCmd.AddCommand(reconcileDevservicesCmd)
}

func runReconcileDevservices(cmd *cobra.Command, args []string) error {
	platformDir, err := resolvePlatformDir(cmd)
	if err != nil {
		return err
	}

	f, err := devservices.Load(platformDir)
	if err != nil {
		return diag.Wrap(err, "ERR_DEVSERVICES_LOAD",
			"could not read devservices.yaml", diag.WithReason(err.Error()))
	}

	dropped := f.PruneUnknownDeps()
	if len(dropped) > 0 {
		if err := f.Save(platformDir); err != nil {
			return diag.Wrap(err, "ERR_DEVSERVICES_WRITE",
				"could not write reconciled devservices.yaml", diag.WithReason(err.Error()))
		}
	}

	out := result.Success(
		fmt.Sprintf("reconciled devservices.yaml (%d service(s), %d dependency(ies) pruned)",
			len(f.Services), len(dropped)),
		map[string]any{"services": len(f.Services), "prunedDeps": dropped},
	)
	// Each pruned dependency is surfaced as a warning — never silently dropped.
	for _, d := range dropped {
		out = out.WithWarnings(diag.New("ERR_DEP_PRUNED",
			fmt.Sprintf("pruned dependency %s", d),
			diag.WithReason("the dependency target is not a service in devservices.yaml (external infra, or not part of this deployment)"),
			diag.WithHint("if the dependency should be managed by kb-dev, deploy it too; otherwise this is expected")))
	}
	emit(cmd, out, outputMode())
	return nil
}
