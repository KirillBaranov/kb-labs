// Package eligibility checks whether an outcome can reach a useful first
// result on the current project before the launcher installs anything.
package eligibility

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/kb-labs/create/internal/detect"
)

// ReleaseEligible reports whether the project contains at least one npm
// package that is not private and has a name and version. This is deliberately
// narrower than merely finding package.json: a private app is not a useful
// launch target for `kb release plan`.
func ReleaseEligible(projectDir string, profile *detect.ProjectProfile) bool {
	candidates := []string{projectDir}
	if profile != nil && profile.Monorepo != nil {
		for _, pkg := range profile.Monorepo.Packages {
			candidates = append(candidates, filepath.Join(projectDir, pkg.Path))
		}
	}
	for _, dir := range candidates {
		if publishablePackage(dir) {
			return true
		}
	}
	return false
}

func publishablePackage(dir string) bool {
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return false
	}
	var pkg struct {
		Name    string `json:"name"`
		Version string `json:"version"`
		Private bool   `json:"private"`
	}
	if json.Unmarshal(data, &pkg) != nil {
		return false
	}
	return !pkg.Private && pkg.Name != "" && pkg.Version != ""
}

// CommitInput reports whether git currently has something for a commit plan.
// A clean repository is a valid installation target, but its handoff must be
// pending rather than pretend the first command will succeed immediately.
func CommitInput(projectDir string) (hasChanges bool, isGitRepo bool) {
	root := exec.Command("git", "rev-parse", "--show-toplevel") // #nosec G204 -- fixed command
	root.Dir = projectDir
	if root.Run() != nil {
		return false, false
	}
	status := exec.Command("git", "status", "--porcelain") // #nosec G204 -- fixed command
	status.Dir = projectDir
	output, err := status.Output()
	if err != nil {
		return false, true
	}
	return len(bytes.TrimSpace(output)) > 0, true
}
