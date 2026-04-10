package cmd

import (
	"time"

	"github.com/spf13/cobra"
)

var readyCmd = &cobra.Command{
	Use:   "ready <targets...>",
	Short: "Block until services are alive (agent-friendly gate)",
	Long: `Blocks until all specified services are in the alive state, or timeout expires.
Useful for scripts and agents that need to wait for backend readiness.`,
	Args: cobra.MinimumNArgs(1),
	RunE: runReady,
}

func init() {
	readyCmd.Flags().Duration("timeout", 60*time.Second, "maximum time to wait")
	rootCmd.AddCommand(readyCmd)
}

func runReady(cmd *cobra.Command, args []string) error {
	mgr, err := loadManager()
	if err != nil {
		return err
	}

	timeout, _ := cmd.Flags().GetDuration("timeout")
	result := mgr.Ready(cmd.Context(), args, timeout)

	if jsonMode {
		return JSONOut(result)
	}

	out := newOutput()
	if result.OK {
		out.OK("all services ready")
	} else {
		for _, a := range result.Actions {
			if a.Action == "not_ready" {
				out.Err(a.Service + ": " + a.Error)
			}
		}
		if result.Hint != "" {
			out.Warn(result.Hint)
		}
		return errSilent
	}
	return nil
}
