package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/customplugin"
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
	state, err = recoverOnboarding(state)
	if err != nil {
		return err
	}
	printOutcomeHandoff(&installer.Result{ProjectCWD: projectDir}, state.FirstCommand, state.PendingInput)
	printCustomPluginSummary(state.CustomPluginDir, state.CustomCommandName)
	printAgentHandoff(state.AgentHandoff)
	return nil
}

// recoverOnboarding turns a checkpoint into a ready handoff only after its
// local prerequisites are observable again. It deliberately never restarts an
// interrupted package installation: selections may require a fresh LLM key
// entry, and that secret is intentionally not persisted in the checkpoint.
func recoverOnboarding(state onboarding.State) (onboarding.State, error) {
	switch state.Status {
	case "ready", "needs-repair":
		// These checkpoints have reached the local configuration phase. A
		// transient PATH/linking failure can be repaired without reinstalling.
	case "installing":
		return onboarding.State{}, fmt.Errorf("onboarding for %q was interrupted during installation — run kb-create doctor, then rerun kb-create %q", state.Outcome, state.ProjectDir)
	default:
		return onboarding.State{}, fmt.Errorf("onboarding for %q has unknown status %q — run kb-create doctor, then rerun kb-create %q", state.Outcome, state.Status, state.ProjectDir)
	}

	if err := onboarding.CheckReadiness(state.PlatformDir, state.FirstCommand); err != nil {
		return onboarding.State{}, fmt.Errorf("onboarding for %q is not ready: %w — run kb-create doctor, then rerun kb-create %q", state.Outcome, err, state.ProjectDir)
	}
	if state.CustomCommandName != "" {
		if err := customplugin.CheckDiscovery(context.Background(), state.ProjectDir, state.CustomCommandName); err != nil {
			return onboarding.State{}, fmt.Errorf("custom command %q is not ready: %w — run kb-create doctor, then rerun kb-create %q", state.CustomCommandName, err, state.ProjectDir)
		}
	}
	if state.Status == "needs-repair" {
		state.Status = "ready"
		if err := onboarding.Write(state); err != nil {
			return onboarding.State{}, fmt.Errorf("save recovered onboarding checkpoint: %w", err)
		}
	}
	return state, nil
}
