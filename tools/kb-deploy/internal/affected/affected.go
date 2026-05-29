// Package affected detects which deploy targets are affected by recent git changes
// or have a failed/pending deploy state.
package affected

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/bmatcuk/doublestar/v4"
	"github.com/kb-labs/kb-deploy/internal/config"
	"github.com/kb-labs/kb-deploy/internal/state"
)

// Detect returns the names of targets to deploy. A target is included when:
//   - Its last deploy failed or it has never been deployed (SHA == ""), OR
//   - Files matching its watch patterns changed since the base ref.
//
// If git diff fails (no parent commit, fresh repo), all targets are returned
// as a safe fallback.
func Detect(repoRoot string, cfg *config.Config, s *state.State) ([]string, error) {
	changed, err := changedFiles(repoRoot)
	if err != nil {
		// No parent commit or other git error — deploy everything.
		var all []string
		for name := range cfg.Targets {
			all = append(all, name)
		}
		return all, nil
	}
	return detectFromChanges(changed, cfg, s), nil
}

// detectFromChanges applies state-aware affected logic given a pre-computed
// list of changed file paths. Extracted for unit testing without git.
func detectFromChanges(changed []string, cfg *config.Config, s *state.State) []string {
	var matched []string
	for name, t := range cfg.Targets {
		ts := s.Targets[name]
		// Include if: never deployed or last deploy failed — regardless of file changes.
		if ts.SHA == "" || s.IsLastDeployFailed(name) {
			matched = append(matched, name)
			continue
		}
		// Include if files changed since last successful deploy.
		if matches(t.Watch, changed) {
			matched = append(matched, name)
		}
	}
	return matched
}

// changedFiles returns the list of files changed since a base ref.
// Uses KB_DEPLOY_BASE_REF env var if set (e.g. the SHA before the push),
// otherwise falls back to HEAD~1.
func changedFiles(repoRoot string) ([]string, error) {
	baseRef := os.Getenv("KB_DEPLOY_BASE_REF")
	if baseRef == "" {
		baseRef = "HEAD~1"
	}
	out, err := exec.Command("git", "-C", repoRoot, "diff", "--name-only", baseRef).Output()
	if err != nil {
		return nil, fmt.Errorf("git diff: %w", err)
	}
	var files []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			files = append(files, line)
		}
	}
	return files, nil
}

// matches returns true if any file in files matches any of the glob patterns.
func matches(patterns, files []string) bool {
	for _, pattern := range patterns {
		for _, file := range files {
			ok, _ := doublestar.Match(pattern, file)
			if ok {
				return true
			}
		}
	}
	return false
}
