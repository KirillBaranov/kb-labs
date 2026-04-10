// Package affected detects which deploy targets are affected by recent git changes.
package affected

import (
	"fmt"
	"os/exec"
	"strings"

	"github.com/bmatcuk/doublestar/v4"
	"github.com/kb-labs/kb-deploy/internal/config"
)

// Detect returns the names of targets whose watch patterns match files changed
// in the last git commit (HEAD~1). If there is no parent commit, all targets
// are returned as a safe fallback.
func Detect(repoRoot string, cfg *config.Config) ([]string, error) {
	changed, err := changedFiles(repoRoot)
	if err != nil {
		// No parent commit or other git error — deploy everything.
		var all []string
		for name := range cfg.Targets {
			all = append(all, name)
		}
		return all, nil
	}

	var matched []string
	for name, t := range cfg.Targets {
		if matches(t.Watch, changed) {
			matched = append(matched, name)
		}
	}
	return matched, nil
}

// changedFiles returns the list of files changed between HEAD~1 and HEAD.
func changedFiles(repoRoot string) ([]string, error) {
	out, err := exec.Command("git", "-C", repoRoot, "diff", "--name-only", "HEAD~1").Output()
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
