package cmd

import (
	"github.com/kb-labs/env/internal/orchestrator"
	"github.com/spf13/cobra"
)

var upFresh bool

var upCmd = &cobra.Command{
	Use:   "up <profile>",
	Short: "Provision and start an environment from a profile",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		l, tb, err := resolveEnv()
		if err != nil {
			return err
		}
		profile, err := tb.Get(args[0])
		if err != nil {
			return err
		}
		overlay, err := tb.OverlayPath(profile)
		if err != nil {
			return err
		}

		info("Provisioning %q (installing platform — this may take a minute)...", args[0])
		res, err := orchestrator.Up(l, args[0], profile, overlay, upFresh)
		if err != nil {
			return err
		}

		if jsonMode {
			return jsonOut(res)
		}
		info("✓ %s is up", args[0])
		info("  gateway: %s", res.GatewayURL)
		info("  enter:   kb-env shell")
		return nil
	},
}

func init() {
	upCmd.Flags().BoolVar(&upFresh, "fresh", false, "wipe any existing environment first")
	rootCmd.AddCommand(upCmd)
}
