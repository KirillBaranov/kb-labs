package cmd

import (
	"os"

	"github.com/kb-labs/env/internal/env"
	"github.com/kb-labs/env/internal/orchestrator"
	"github.com/spf13/cobra"
)

var downRemove bool

var downCmd = &cobra.Command{
	Use:   "down",
	Short: "Stop the live environment (and remove it with --rm)",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		l, err := env.Resolve()
		if err != nil {
			return err
		}
		if !l.Exists() {
			info("No live environment.")
			return nil
		}

		ws, err := orchestrator.WorkspaceRoot()
		if err != nil {
			return err
		}
		if kbdev, berr := orchestrator.ResolveBinary("kb-dev", ws); berr == nil {
			k := orchestrator.KBDev{Bin: kbdev, Config: l.DevservicesPath(), Layout: l}
			_, _, _ = k.Stop()
		}

		// Verdaccio is an environment-level process — stop it on any `down`, not
		// just --rm, so it never lingers after the env is taken down.
		orchestrator.StopVerdaccio(l)

		if downRemove {
			_ = os.RemoveAll(l.SocketDir())
			if err := l.Remove(); err != nil {
				return err
			}
			info("✓ environment stopped and removed")
		} else {
			info("✓ environment stopped (use --rm to delete it)")
		}

		if jsonMode {
			return jsonOut(map[string]any{"ok": true, "removed": downRemove})
		}
		return nil
	},
}

func init() {
	downCmd.Flags().BoolVar(&downRemove, "rm", false, "remove the environment directory and sockets")
	rootCmd.AddCommand(downCmd)
}
