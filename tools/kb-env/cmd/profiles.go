package cmd

import (
	"github.com/spf13/cobra"
)

var profilesCmd = &cobra.Command{
	Use:   "profiles",
	Short: "List available profiles",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		_, tb, err := resolveEnv()
		if err != nil {
			return err
		}

		if jsonMode {
			return jsonOut(tb)
		}
		for _, name := range tb.Names() {
			p := tb.Profiles[name]
			info("%-14s %s", name, p.Description)
			info("               plugins: %v  services: %v", p.Plugins, p.Services)
		}
		return nil
	},
}

func init() { rootCmd.AddCommand(profilesCmd) }
