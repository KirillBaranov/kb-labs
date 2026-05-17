package checks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

// DepsRule checks dependency link: resolution, version consistency, and
// allowlist/denylist of @kb-labs/* dependencies.
type DepsRule struct{}

func (r *DepsRule) Name() string { return "deps" }

func (r *DepsRule) Check(pkg workspace.Package, preset config.Preset) []Issue {
	rules := preset.Deps
	hasBoundaryRules := len(rules.AllowedKbDeps) > 0 || len(rules.ForbiddenKbDeps) > 0
	if !rules.CheckLinks && !rules.CheckVersionConsistency && !hasBoundaryRules {
		return nil
	}

	path := filepath.Join(pkg.Dir, "package.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var raw struct {
		Name             string            `json:"name"`
		Dependencies     map[string]string `json:"dependencies"`
		DevDependencies  map[string]string `json:"devDependencies"`
		PeerDependencies map[string]string `json:"peerDependencies"`
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
	for k, v := range raw.PeerDependencies {
		allDeps[k] = v
	}

	if rules.CheckLinks {
		issues = append(issues, checkLinkDeps(pkg.Dir, allDeps, r.Name())...)
	}

	if hasBoundaryRules {
		issues = append(issues, checkBoundaryDeps(pkg, raw.Name, allDeps, rules, r.Name())...)
		issues = append(issues, checkBoundaryImports(pkg, raw.Name, rules, r.Name())...)
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

		targetPkgJSON := filepath.Join(abs, "package.json")
		targetData, err := os.ReadFile(targetPkgJSON)
		if err != nil {
			continue
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

// checkBoundaryDeps enforces allowed/forbidden @kb-labs/* dependencies declared
// in package.json against the preset's lists.
func checkBoundaryDeps(pkg workspace.Package, pkgName string, deps map[string]string, rules config.DepsRules, checkName string) []Issue {
	var issues []Issue
	for depName := range deps {
		if !strings.HasPrefix(depName, "@kb-labs/") {
			continue
		}
		// Self-dependency: a package is allowed to depend on its own
		// subpackages (e.g. monorepo nested packages share scope).
		if depName == pkgName {
			continue
		}
		// AllowedKbDeps takes priority over ForbiddenKbDeps — an explicit
		// allowlist entry is an intentional exception (e.g. gateway-auth in
		// environment-docker).
		if len(rules.AllowedKbDeps) > 0 && matchAny(depName, rules.AllowedKbDeps) {
			continue
		}
		if matchAny(depName, rules.ForbiddenKbDeps) {
			issues = append(issues, Issue{
				Check:    checkName,
				Severity: SeverityError,
				Message: fmt.Sprintf(
					"forbidden dependency %q in package.json — adapters/plugins must depend only on @kb-labs/sdk",
					depName,
				),
				File: filepath.Join(pkg.Dir, "package.json"),
			})
			continue
		}
		if len(rules.AllowedKbDeps) > 0 && !matchAny(depName, rules.AllowedKbDeps) {
			issues = append(issues, Issue{
				Check:    checkName,
				Severity: SeverityError,
				Message: fmt.Sprintf(
					"dependency %q is not in the allowlist — adapters/plugins must depend only on @kb-labs/sdk",
					depName,
				),
				File: filepath.Join(pkg.Dir, "package.json"),
			})
		}
	}
	return issues
}

// importRe matches `from '...'` or `from "..."` strings in TS/JS sources.
// We only care about @kb-labs/* specifiers, so the inner content is captured.
var importRe = regexp.MustCompile(`from\s+['"](@kb-labs/[^'"]+)['"]`)

// checkBoundaryImports walks the package source tree and reports any
// @kb-labs/* import string that violates the allow/forbid lists.
func checkBoundaryImports(pkg workspace.Package, pkgName string, rules config.DepsRules, checkName string) []Issue {
	var issues []Issue
	srcDir := filepath.Join(pkg.Dir, "src")
	if _, err := os.Stat(srcDir); err != nil {
		return nil
	}

	_ = filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		ext := filepath.Ext(path)
		if ext != ".ts" && ext != ".tsx" && ext != ".mts" && ext != ".cts" && ext != ".js" && ext != ".mjs" && ext != ".cjs" {
			return nil
		}
		data, rerr := os.ReadFile(path)
		if rerr != nil {
			return nil
		}
		for _, m := range importRe.FindAllSubmatch(data, -1) {
			spec := string(m[1])
			if spec == pkgName || strings.HasPrefix(spec, pkgName+"/") {
				continue
			}
			// AllowedKbDeps takes priority over ForbiddenKbDeps.
			if len(rules.AllowedKbDeps) > 0 && matchAny(spec, rules.AllowedKbDeps) {
				continue
			}
			if matchAny(spec, rules.ForbiddenKbDeps) {
				issues = append(issues, Issue{
					Check:    checkName,
					Severity: SeverityError,
					Message: fmt.Sprintf(
						"forbidden import %q — adapters/plugins must import only from @kb-labs/sdk",
						spec,
					),
					File: path,
				})
				continue
			}
			if len(rules.AllowedKbDeps) > 0 && !matchAny(spec, rules.AllowedKbDeps) {
				issues = append(issues, Issue{
					Check:    checkName,
					Severity: SeverityError,
					Message: fmt.Sprintf(
						"import %q is not in the allowlist — adapters/plugins must import only from @kb-labs/sdk",
						spec,
					),
					File: path,
				})
			}
		}
		return nil
	})
	return issues
}

// matchAny reports whether s matches any of the glob-style patterns. A pattern
// of "@kb-labs/foo" matches exact + any sub-path ("@kb-labs/foo", "@kb-labs/foo/bar").
// A pattern with "*" is interpreted as a simple glob (* matches any non-slash run).
func matchAny(s string, patterns []string) bool {
	for _, p := range patterns {
		if matchPattern(s, p) {
			return true
		}
	}
	return false
}

func matchPattern(s, pattern string) bool {
	if strings.ContainsAny(pattern, "*?[") {
		// Use filepath.Match for glob semantics. For multi-segment globs like
		// "@kb-labs/core-*", filepath.Match treats "/" as a separator; we want
		// it to be a regular char, so swap to a placeholder.
		const slashPlaceholder = "\x00"
		ps := strings.ReplaceAll(pattern, "/", slashPlaceholder)
		ss := strings.ReplaceAll(s, "/", slashPlaceholder)
		ok, err := filepath.Match(ps, ss)
		if err == nil && ok {
			return true
		}
		// Also allow the pattern to match a prefix followed by an additional
		// sub-path: pattern "@kb-labs/sdk/*" should match "@kb-labs/sdk/adapters".
		// Handle the common "<prefix>/*" trailing form explicitly.
		if strings.HasSuffix(pattern, "/*") {
			prefix := strings.TrimSuffix(pattern, "/*")
			if s == prefix || strings.HasPrefix(s, prefix+"/") {
				return true
			}
		}
		return false
	}
	// Literal pattern: match exact or any sub-path.
	return s == pattern || strings.HasPrefix(s, pattern+"/")
}
