// Package customplugin creates the minimal plugin selected in the custom
// onboarding path. It deliberately delegates generation to @kb-labs/scaffold
// so the launcher and the normal CLI share one template implementation.
package customplugin

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
)

type Contract struct {
	Name        string
	Description string
}

type Result struct {
	PluginDir   string
	Manifest    string
	HandlerHint string
}

// Create runs the scaffold command only after the user confirms their
// contract. It never uses --force: an existing plugin directory is surfaced
// as a recovery case instead of being overwritten.
func Create(ctx context.Context, projectDir string, contract Contract) (Result, error) {
	if contract.Name == "" {
		return Result{}, fmt.Errorf("custom command name is required")
	}
	kbPath, err := exec.LookPath("kb")
	if err != nil {
		return Result{}, fmt.Errorf("locate kb CLI: %w", err)
	}
	cmd := exec.CommandContext(ctx, kbPath, "scaffold", "run", "plugin", contract.Name, "--yes") // #nosec G204 -- kb path comes from PATH; contract is validated by wizard
	cmd.Dir = projectDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return Result{}, fmt.Errorf("scaffold plugin %q: %w\n%s", contract.Name, err, output)
	}
	pluginDir := filepath.Join(projectDir, ".kb", "plugins", contract.Name)
	return Result{
		PluginDir:   pluginDir,
		Manifest:    filepath.Join(pluginDir, "packages", contract.Name+"-entry", "src", "manifest.ts"),
		HandlerHint: filepath.Join(pluginDir, "packages", contract.Name+"-entry", "src"),
	}, nil
}

// CheckDiscovery proves that the freshly scaffolded command is available to
// the same CLI a user or coding agent will invoke. `--help` is intentionally
// used so this check cannot perform the command's business action.
func CheckDiscovery(ctx context.Context, projectDir, commandName string) error {
	if commandName == "" {
		return fmt.Errorf("custom command name is required")
	}
	kbPath, err := exec.LookPath("kb")
	if err != nil {
		return fmt.Errorf("locate kb CLI: %w", err)
	}
	cmd := exec.CommandContext(ctx, kbPath, commandName, "hello", "--help") // #nosec G204 -- kb path comes from PATH; command name is wizard-validated
	cmd.Dir = projectDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("discover custom command %q: %w\n%s", commandName, err, output)
	}
	return nil
}
