package cmd

import (
	"github.com/spf13/cobra"
)

var stopCmd = &cobra.Command{
	Use:   "stop [target]",
	Short: "Stop all services, a group, or a single service",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runStop,
}

func init() {
	rootCmd.AddCommand(stopCmd)
}

func runStop(cmd *cobra.Command, args []string) error {
	mgr, err := loadManager()
	if err != nil {
		return err
	}

	target := ""
	if len(args) > 0 {
		target = args[0]
	}

	targets, err := mgr.Config().ResolveTarget(target)
	if err != nil {
		return err
	}

	cascade := ShouldCascade(cmd, false)
	result := mgr.Stop(cmd.Context(), targets, cascade)

	if jsonMode {
		return JSONOut(result)
	}

	out := newOutput()
	for _, a := range result.Actions {
		switch a.Action {
		case "stopped":
			out.OK(a.Service + " stopped")
		case "skipped":
			out.Info(a.Service + " already stopped")
		}
	}

	return nil
}
