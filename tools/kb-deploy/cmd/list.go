package cmd

import (
	"sort"

	"github.com/spf13/cobra"
)

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List configured deploy targets",
	Args:  cobra.NoArgs,
	RunE:  runList,
}

func init() {
	rootCmd.AddCommand(listCmd)
}

type targetSummary struct {
	Name  string `json:"name"`
	Image string `json:"image"`
	Host  string `json:"host"`
}

func runList(cmd *cobra.Command, args []string) error {
	cfg, _, err := loadConfig()
	if err != nil {
		return err
	}

	names := make([]string, 0, len(cfg.Targets))
	for name := range cfg.Targets {
		names = append(names, name)
	}
	sort.Strings(names)

	if jsonMode {
		targets := make([]targetSummary, 0, len(names))
		for _, name := range names {
			t := cfg.Targets[name]
			targets = append(targets, targetSummary{
				Name:  name,
				Image: cfg.Registry + "/" + t.Image,
				Host:  t.SSH.Host,
			})
		}
		return JSONOut(map[string]any{"ok": true, "targets": targets})
	}

	o := newOutput()
	o.Section("Deploy targets")
	for _, name := range names {
		t := cfg.Targets[name]
		o.Bullet(name, t.SSH.Host)
		o.Detail("image: " + cfg.Registry + "/" + t.Image)
	}
	return nil
}
