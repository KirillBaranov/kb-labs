package cmd

import (
	"github.com/spf13/cobra"
)

var exampleCmd = &cobra.Command{
	Use:   "example",
	Short: "Example command",
	RunE: func(cmd *cobra.Command, args []string) error {
		o := newOutput()
		o.OK("example ran successfully")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(exampleCmd)
}
