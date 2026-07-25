// Package preflight verifies that onboarding can begin without writing files or
// contacting a registry. It deliberately keeps repair out of this phase.
package preflight

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/kb-labs/create/internal/pm"
)

// Check validates the project, platform destination, Node.js and the package
// manager selected for the install. It performs only filesystem metadata and
// PATH reads; callers can safely run it before creating a checkpoint.
func Check(projectDir, platformDir string, manager pm.PackageManager) error {
	if err := projectDestination(projectDir); err != nil {
		return err
	}
	if err := writableParent("platform", platformDir); err != nil {
		return err
	}
	if _, err := exec.LookPath("node"); err != nil {
		return fmt.Errorf("Node.js was not found in PATH — install Node.js and run this command again")
	}
	if manager == nil {
		return fmt.Errorf("no package manager was selected")
	}
	if _, err := exec.LookPath(manager.Name()); err != nil {
		return fmt.Errorf("%s was not found in PATH — install it and run this command again", manager.Name())
	}
	return nil
}

// projectDestination accepts both an existing project and the new directory
// form used by `kb-create my-project`. Creation is owned by the installer so
// preflight remains read-only; here we only verify that the path is usable.
func projectDestination(path string) error {
	info, err := os.Stat(path)
	if err == nil {
		if !info.IsDir() {
			return fmt.Errorf("project path %q is not a directory", path)
		}
		return nil
	}
	if !os.IsNotExist(err) {
		return fmt.Errorf("inspect project directory %q: %w", path, err)
	}
	return writableParent("project", path)
}

func existingDirectory(label, path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("%s directory %q is not available: %w", label, path, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%s path %q is not a directory", label, path)
	}
	return nil
}

func writableParent(label, path string) error {
	current := filepath.Clean(path)
	for {
		info, err := os.Stat(current)
		if err == nil {
			if !info.IsDir() {
				return fmt.Errorf("%s destination parent %q is not a directory", label, current)
			}
			if info.Mode().Perm()&0o222 == 0 {
				return fmt.Errorf("%s destination %q is not writable — choose another directory or fix its permissions", label, path)
			}
			return nil
		}
		if !os.IsNotExist(err) {
			return fmt.Errorf("inspect %s destination %q: %w", label, path, err)
		}
		next := filepath.Dir(current)
		if next == current {
			return fmt.Errorf("no existing parent found for %s destination %q", label, path)
		}
		current = next
	}
}
