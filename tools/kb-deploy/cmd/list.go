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

func runList(cmd *cobra.Command, args []string) error {
	cfg, _, err := loadConfig()
	if err != nil {
		return err
	}

	o := newOutput()
	o.Section("Deploy targets")

	names := make([]string, 0, len(cfg.Targets))
	for name := range cfg.Targets {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		t := cfg.Targets[name]
		o.Bullet(name, t.SSH.Host)
		o.Detail("image: " + cfg.Registry + "/" + t.Image)
	}

	return nil
}
