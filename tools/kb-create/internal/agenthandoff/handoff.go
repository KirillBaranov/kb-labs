// Package agenthandoff writes a bounded, portable task for a coding agent.
package agenthandoff

import (
	"fmt"
	"os"
	"path/filepath"
)

type Input struct {
	ProjectDir, PluginDir, CommandName, Description string
}

func Write(input Input) (string, error) {
	if input.ProjectDir == "" || input.PluginDir == "" || input.CommandName == "" || input.Description == "" {
		return "", fmt.Errorf("agent handoff requires project, plugin, command, and description")
	}
	path := filepath.Join(input.ProjectDir, ".kb", "onboarding", "agent-handoff.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return "", fmt.Errorf("create agent handoff directory: %w", err)
	}
	content := fmt.Sprintf("# Implement one KB Labs command\n\nGoal: %s\n\nCommand: `kb %s hello`\n\nWork only in:\n\n- %s\n\nStart here:\n\n- Manifest: %s/packages/%s-entry/src/manifest.ts\n- Handler: %s/packages/%s-entry/src\n\nSafety: keep the first command read-only/preview-safe. Do not add push, publish, commit, or external calls without a separate user confirmation.\n\nBefore handing back:\n\n1. Run the generated package tests/build.\n2. Refresh plugin discovery if the scaffold asks for it.\n3. Run `kb %s hello` from the project root.\n\nKeep every change visible in the plugin directory. Do not read or write credentials, project source outside this plugin, or global KB Labs configuration.\n", input.Description, input.CommandName, input.PluginDir, input.PluginDir, input.CommandName, input.PluginDir, input.CommandName, input.CommandName)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return "", fmt.Errorf("write agent handoff: %w", err)
	}
	return path, nil
}
