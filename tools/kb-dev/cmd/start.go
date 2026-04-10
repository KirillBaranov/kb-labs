package cmd

import (
	"github.com/spf13/cobra"
)

var startCmd = &cobra.Command{
	Use:   "start [target]",
	Short: "Start all services, a group, or a single service",
	Long:  "Starts services with dependency resolution. Dependencies are started automatically.",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runStart,
}

func init() {
	startCmd.Flags().Bool("watch", false, "stay alive and auto-restart crashed services")
	rootCmd.AddCommand(startCmd)
}

func runStart(cmd *cobra.Command, args []string) error {
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

	result := mgr.Start(cmd.Context(), targets, forceFlag)

	if jsonMode {
		return JSONOut(result)
	}

	out := newOutput()
	for _, a := range result.Actions {
		switch a.Action {
		case "started":
			out.OK(a.Service + " started (" + a.Elapsed + ")")
		case "skipped":
			out.Info(a.Service + " already running")
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

	// Watch mode.
	watch, _ := cmd.Flags().GetBool("watch")
	if watch && result.OK {
		out.Info("Watching services (Ctrl+C to stop)...")
		mgr.Watch(cmd.Context())
	}

	if !result.OK {
		return errSilent
	}
	return nil
}
