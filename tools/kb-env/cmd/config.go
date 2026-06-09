package cmd

import (
	"fmt"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/env/internal/orchestrator"
	"github.com/spf13/cobra"
)

var configCmd = &cobra.Command{
	Use:   "config <profile>",
	Short: "Hot-swap the live environment's config overlay (no reinstall)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		l, tb, err := resolveEnv()
		if err != nil {
			return err
		}
		if !l.Exists() {
			return fmt.Errorf("no live environment; run `kb-env up <profile>` first")
		}
		meta, _ := l.ReadMeta()

		profile, err := tb.Get(args[0])
		if err != nil {
			return err
		}
		overlay, err := tb.OverlayPath(profile)
		if err != nil {
			return err
		}
		if overlay == "" {
			return fmt.Errorf("profile %q declares no `config:` overlay to apply", args[0])
		}

		// Hot-swap only works when the running env has the same plugin set;
		// changing plugins needs a reinstall (`up`), not a config switch.
		if cur, _ := tb.Get(meta.Profile); !samePlugins(cur.Plugins, profile.Plugins) {
			return diag.New("ERR_PROFILE_MISMATCH", "config switch needs the same plugin set",
				diag.WithReason(fmt.Sprintf("live=%v requested=%v", cur.Plugins, profile.Plugins)),
				diag.WithHint("run `kb-env up "+args[0]+" --fresh` to change plugins"))
		}

		ws, err := orchestrator.WorkspaceRoot()
		if err != nil {
			return err
		}
		kbdev, err := orchestrator.ResolveBinary("kb-dev", ws)
		if err != nil {
			return err
		}
		k := orchestrator.KBDev{Bin: kbdev, Config: l.DevservicesPath(), Offset: meta.Offset, Layout: l}

		info("Applying config %q (overlay + restart, no reinstall)...", args[0])
		if err := orchestrator.ApplyConfig(l, k, overlay, profile.Services); err != nil {
			return err
		}

		meta.Profile = args[0]
		_ = l.WriteMeta(meta)
		if jsonMode {
			return jsonOut(map[string]any{"ok": true, "profile": args[0]})
		}
		info("✓ config switched to %s", args[0])
		return nil
	},
}

func samePlugins(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	seen := map[string]bool{}
	for _, x := range a {
		seen[x] = true
	}
	for _, x := range b {
		if !seen[x] {
			return false
		}
	}
	return true
}

func init() { rootCmd.AddCommand(configCmd) }
