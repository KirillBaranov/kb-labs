package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/onboarding"
)

var continueCmd = &cobra.Command{
	Use:   "continue [project-dir]",
	Short: "Resume first-command onboarding",
	Args:  cobra.MaximumNArgs(1),
	RunE:  runContinue,
}

func init() { rootCmd.AddCommand(continueCmd) }

func runContinue(_ *cobra.Command, args []string) error {
	projectDir := ""
	if len(args) == 1 {
		var err error
		projectDir, err = filepath.Abs(args[0])
		if err != nil {
			return err
		}
	} else {
		projectDir, _ = os.Getwd()
	}
	state, err := onboarding.Read(projectDir)
	if err != nil {
		return fmt.Errorf("no resumable onboarding in %s: %w", projectDir, err)
	}
	if state.Status != "ready" {
		return fmt.Errorf("onboarding for %q is incomplete — run kb-create doctor, then rerun kb-create %q", state.Outcome, projectDir)
	}
	printOutcomeHandoff(&installer.Result{ProjectCWD: projectDir}, state.FirstCommand, state.PendingInput)
	printCustomPluginSummary(state.CustomPluginDir, state.CustomCommandName)
	return nil
}
