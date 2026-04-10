package cmd

import (
	"github.com/spf13/cobra"
)

var restartCmd = &cobra.Command{
	Use:   "restart [target]",
	Short: "Restart services with dependent cascade",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runRestart,
}

func init() {
	rootCmd.AddCommand(restartCmd)
}

func runRestart(cmd *cobra.Command, args []string) error {
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

	cascade := ShouldCascade(cmd, true) // default true for restart
	result := mgr.Restart(cmd.Context(), targets, cascade, forceFlag)

	if jsonMode {
		return JSONOut(result)
	}

	out := newOutput()
	for _, a := range result.Actions {
		switch a.Action {
		case "stopped":
			out.Info(a.Service + " stopped")
		case "started":
			out.OK(a.Service + " started (" + a.Elapsed + ")")
		case "failed":
			out.Err(a.Service + " failed: " + a.Error)
		}
	}

	if !result.OK {
		return errSilent
	}
	return nil
}
