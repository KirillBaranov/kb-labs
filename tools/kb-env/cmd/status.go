package cmd

import (
	"fmt"
	"os"

	"github.com/kb-labs/env/internal/env"
	"github.com/kb-labs/env/internal/orchestrator"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show the live environment's services",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		l, err := env.Resolve()
		if err != nil {
			return err
		}
		if !l.Exists() {
			return fmt.Errorf("no live environment; run `kb-env up <profile>` first")
		}
		meta, _ := l.ReadMeta()

		ws, err := orchestrator.WorkspaceRoot()
		if err != nil {
			return err
		}
		kbdev, err := orchestrator.ResolveBinary("kb-dev", ws)
		if err != nil {
			return err
		}
		k := orchestrator.KBDev{Bin: kbdev, Config: l.DevservicesPath(), Offset: meta.Offset, Layout: l}
		raw, _ := k.StatusRaw()

		if jsonMode {
			// Pass through kb-dev's status JSON; meta is on stdout context.
			_, _ = os.Stdout.Write(raw)
			return nil
		}
		info("profile: %s  offset: %d  status: %s", meta.Profile, meta.Offset, meta.Status)
		_, _ = os.Stdout.Write(raw)
		return nil
	},
}

func init() { rootCmd.AddCommand(statusCmd) }
