// Package customplugin creates the minimal plugin selected in the custom
// onboarding path. It deliberately delegates generation to @kb-labs/scaffold
// so the launcher and the normal CLI share one template implementation.
package customplugin

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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

type Hooks struct {
	OnStep func(string)
}

// Create runs the scaffold command only after the user confirms their
// contract. It never uses --force: an existing plugin directory is surfaced
// as a recovery case instead of being overwritten.
func Create(ctx context.Context, projectDir string, contract Contract, hooks ...Hooks) (Result, error) {
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
	if err := EnsureBuilt(ctx, pluginDir, hooks...); err != nil {
		return Result{}, fmt.Errorf("build custom plugin %q: %w", contract.Name, err)
	}
	return Result{
		PluginDir:   pluginDir,
		Manifest:    filepath.Join(pluginDir, "packages", contract.Name+"-entry", "src", "manifest.ts"),
		HandlerHint: filepath.Join(pluginDir, "packages", contract.Name+"-entry", "src"),
	}, nil
}

// EnsureBuilt installs the generated plugin's dependencies and produces dist/ so
// the marketplace entry written by `kb scaffold` points at a loadable
// manifest. A scaffolded plugin is not discoverable from source alone: the
// CLI discovery contract loads the `kb.manifest` path from package.json.
func EnsureBuilt(ctx context.Context, pluginDir string, hooks ...Hooks) error {
	manifestPath := filepath.Join(pluginDir, "packages")
	entries, err := os.ReadDir(manifestPath)
	if err != nil {
		return fmt.Errorf("inspect generated packages: %w", err)
	}
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasSuffix(entry.Name(), "-entry") {
			continue
		}
		if _, err := os.Stat(filepath.Join(manifestPath, entry.Name(), "dist", "manifest.js")); err == nil {
			return nil
		}
		break
	}

	pnpmPath, err := exec.LookPath("pnpm")
	if err != nil {
		return fmt.Errorf("locate pnpm: %w", err)
	}

	if len(hooks) > 0 && hooks[0].OnStep != nil {
		hooks[0].OnStep("[5/5] Installing custom plugin dependencies")
	}
	install := exec.CommandContext(ctx, pnpmPath, "install", "--no-frozen-lockfile") // #nosec G204 -- pnpm path comes from PATH
	install.Dir = pluginDir
	if output, err := install.CombinedOutput(); err != nil {
		return fmt.Errorf("pnpm install: %w\n%s", err, output)
	}

	if len(hooks) > 0 && hooks[0].OnStep != nil {
		hooks[0].OnStep("[5/5] Building custom plugin")
	}
	build := exec.CommandContext(ctx, pnpmPath, "run", "build") // #nosec G204 -- pnpm path comes from PATH
	build.Dir = pluginDir
	if output, err := build.CombinedOutput(); err != nil {
		return fmt.Errorf("pnpm run build: %w\n%s", err, output)
	}
	return nil
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
