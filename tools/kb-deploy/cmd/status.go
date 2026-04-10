package cmd

import (
	"fmt"
	"sort"

	"github.com/kb-labs/kb-deploy/internal/state"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show last deployed SHA per target",
	Args:  cobra.NoArgs,
	RunE:  runStatus,
}

func init() {
	rootCmd.AddCommand(statusCmd)
}

func runStatus(cmd *cobra.Command, args []string) error {
	_, repoRoot, err := loadConfig()
	if err != nil {
		return err
	}

	s, err := state.Load(stateFilePath(repoRoot))
	if err != nil {
		return fmt.Errorf("load state: %w", err)
	}

	if jsonMode {
		return JSONOut(s)
	}

	o := newOutput()
	o.Section("Deploy status")

	if len(s.Targets) == 0 {
		o.Info("no deployments yet")
		return nil
	}

	names := make([]string, 0, len(s.Targets))
	for name := range s.Targets {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		ts := s.Targets[name]
		o.Bullet(name, ts.SHA)
		o.Detail("deployed at: " + ts.DeployedAt.Format("2006-01-02 15:04:05 UTC"))
	}

	return nil
}
