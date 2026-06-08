// Package orchestrator drives kb-create (install) and kb-dev (services) to
// provision and run a sandbox environment. It shells out to the real binaries
// and parses their JSON — it does not reimplement install/service logic.
package orchestrator

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// WorkspaceRoot walks up from the current directory to the monorepo root,
// identified by devkit.yaml.
func WorkspaceRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "devkit.yaml")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("workspace root not found (no devkit.yaml above %s)", dir)
		}
		dir = parent
	}
}

// ResolveBinary finds a tool binary. The workspace-built binary
// (<workspaceRoot>/tools/<name>/<name>) wins over PATH: kb-env provisions the
// CURRENT workspace's build, so a stale binary on PATH must never shadow it.
// PATH is only a fallback when the workspace binary isn't built.
func ResolveBinary(name, workspaceRoot string) (string, error) {
	local := filepath.Join(workspaceRoot, "tools", name, name)
	if _, err := os.Stat(local); err == nil {
		return local, nil
	}
	if p, err := exec.LookPath(name); err == nil {
		return p, nil
	}
	return "", fmt.Errorf("%s not found at %s or on PATH (build it: make -C tools/%s build)", name, local, name)
}
