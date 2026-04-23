package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	planJSON bool
)

var planCmd = &cobra.Command{
	Use:   "plan",
	Short: "Compute rollout plan without executing",
	Long: `plan reads .kb/deploy.yaml, probes every host over SSH, and prints the
action plan that 'kb-deploy apply' would execute. Drift against the previous
lock is surfaced separately.

Exit codes:
  0  plan computed, no changes
  2  plan computed, changes present (CI pattern: 'if plan; then skip else apply')
  4  drift detected (human intervention required)
  1  error (validation, SSH, config)

Examples:
  kb-deploy plan
  kb-deploy plan --json > plan.json
  kb-deploy plan --config path/to/deploy.yaml`,
	SilenceUsage: true,
	RunE:         runPlan,
}

func init() {
	planCmd.Flags().BoolVar(&planJSON, "json", false, "emit machine-readable JSON")
	rootCmd.AddCommand(planCmd)
}

func runPlan(cmd *cobra.Command, args []string) error {
	flow, err := loadFlow()
	if err != nil {
		return err
	}
	defer flow.CloseAll()

	if planJSON {
		return emitPlanJSON(cmd, flow)
	}
	return emitPlanHuman(cmd, flow)
}

func emitPlanHuman(cmd *cobra.Command, flow *applyFlow) error {
	out := cmd.OutOrStdout()
	fmt.Fprintln(out, flow.Plan.String())
	printDrift(cmd, flow.Drift)
	sum := flow.Plan.Summary()
	fmt.Fprintf(out,
		"summary: install=%d swap=%d restart=%d skip=%d drift=%d\n",
		sum.Install, sum.Swap, sum.Restart, sum.Skip, len(flow.Drift))

	// Exit codes (CI contract).
	switch {
	case len(flow.Drift) > 0:
		os.Exit(4) //nolint:gocritic
	case flow.Plan.HasChanges():
		os.Exit(2) //nolint:gocritic
	}
	return nil
}

func emitPlanJSON(cmd *cobra.Command, flow *applyFlow) error {
	payload := map[string]interface{}{
		"summary": map[string]int{
			"install": flow.Plan.Summary().Install,
			"swap":    flow.Plan.Summary().Swap,
			"restart": flow.Plan.Summary().Restart,
			"skip":    flow.Plan.Summary().Skip,
			"drift":   len(flow.Drift),
		},
		"waves":  flow.Plan.Waves,
		"drift":  flow.Drift,
	}
	enc := json.NewEncoder(cmd.OutOrStdout())
	enc.SetIndent("", "  ")
	if err := enc.Encode(payload); err != nil {
		return err
	}
	switch {
	case len(flow.Drift) > 0:
		os.Exit(4) //nolint:gocritic
	case flow.Plan.HasChanges():
		os.Exit(2) //nolint:gocritic
	}
	return nil
}
