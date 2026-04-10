package checks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

// DepsRule checks dependency link: resolution and version consistency.
type DepsRule struct{}

func (r *DepsRule) Name() string { return "deps" }

func (r *DepsRule) Check(pkg workspace.Package, preset config.Preset) []Issue {
	rules := preset.Deps
	if !rules.CheckLinks && !rules.CheckVersionConsistency {
		return nil
	}

	path := filepath.Join(pkg.Dir, "package.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var raw struct {
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil
	}

	var issues []Issue

	allDeps := make(map[string]string)
	for k, v := range raw.Dependencies {
		allDeps[k] = v
	}
	for k, v := range raw.DevDependencies {
		allDeps[k] = v
	}

	if rules.CheckLinks {
		issues = append(issues, checkLinkDeps(pkg.Dir, allDeps, r.Name())...)
	}

	return issues
}

// checkLinkDeps validates that all link: dependencies point to existing directories
// with matching package names.
func checkLinkDeps(pkgDir string, deps map[string]string, checkName string) []Issue {
	var issues []Issue
	for depName, depVer := range deps {
		if !strings.HasPrefix(depVer, "link:") {
			continue
		}
		linkPath := strings.TrimPrefix(depVer, "link:")
		resolved := filepath.Join(pkgDir, linkPath)
		abs, err := filepath.Abs(resolved)
		if err != nil {
			issues = append(issues, Issue{
				Check:    checkName,
				Severity: SeverityError,
				Message:  fmt.Sprintf("cannot resolve link: path %q for %q", linkPath, depName),
			})
			continue
		}

		if _, err := os.Stat(abs); os.IsNotExist(err) {
			issues = append(issues, Issue{
				Check:    checkName,
				Severity: SeverityError,
				Message:  fmt.Sprintf("link: target %q does not exist (dep: %q)", abs, depName),
				Fix:      fmt.Sprintf("check that %s is initialized (git submodule update --init)", linkPath),
			})
			continue
		}

		// Verify the package name matches.
		targetPkgJSON := filepath.Join(abs, "package.json")
		targetData, err := os.ReadFile(targetPkgJSON)
		if err != nil {
			continue // no package.json at target, skip name check
		}
		var targetPkg struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(targetData, &targetPkg); err != nil {
			continue
		}
		if targetPkg.Name != "" && targetPkg.Name != depName {
			issues = append(issues, Issue{
				Check:    checkName,
				Severity: SeverityError,
				Message:  fmt.Sprintf("link: target name %q does not match declared dep %q", targetPkg.Name, depName),
				File:     targetPkgJSON,
			})
		}
	}
	return issues
}
