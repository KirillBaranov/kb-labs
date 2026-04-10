package cmd

import (
	"github.com/spf13/cobra"
)

var ensureCmd = &cobra.Command{
	Use:   "ensure <targets...>",
	Short: "Ensure services are alive (idempotent, agent-friendly)",
	Long: `Idempotent desired state command. For each target:
  - Already alive → skip
  - Dead → start (with dependencies)
  - Failed → restart

Returns ok:true only when ALL targets are alive.`,
	Args: cobra.MinimumNArgs(1),
	RunE: runEnsure,
}

func init() {
	rootCmd.AddCommand(ensureCmd)
}

func runEnsure(cmd *cobra.Command, args []string) error {
	mgr, err := loadManager()
	if err != nil {
		return err
	}

	result := mgr.Ensure(cmd.Context(), args)

	if jsonMode {
		return JSONOut(result)
	}

	out := newOutput()
	for _, a := range result.Actions {
		switch a.Action {
		case "started":
			out.OK(a.Service + " started (" + a.Elapsed + ")")
		case "skipped":
			out.Info(a.Service + " " + a.Reason)
		case "failed":
			out.Err(a.Service + " failed: " + a.Error)
			for _, line := range a.LogsTail {
				out.Detail(line)
			}
		}
	}

	if result.Hint != "" {
		out.Warn(result.Hint)
	}

	if !result.OK {
		return errSilent
	}
	return nil
}
