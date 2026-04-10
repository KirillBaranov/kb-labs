package detect

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// detectMonorepo checks for workspace configuration in dir.
// Returns nil if no monorepo layout is detected.
func detectMonorepo(dir string, pm PkgManager) *MonorepoInfo {
	// pnpm workspaces (highest priority — most specific)
	if globs := parsePnpmWorkspace(dir); len(globs) > 0 {
		return &MonorepoInfo{Tool: "pnpm-workspaces", Globs: globs}
	}

	// npm/yarn workspaces (from package.json)
	if globs := parsePackageJSONWorkspaces(dir); len(globs) > 0 {
		tool := "npm-workspaces"
		if pm == PMYarn {
			tool = "yarn-workspaces"
		}
		return &MonorepoInfo{Tool: tool, Globs: globs}
	}

	// Cargo workspace
	if isCargoWorkspace(dir) {
		return &MonorepoInfo{Tool: "cargo-workspace"}
	}

	// Tool-specific config files (existence only)
	if fileExists(filepath.Join(dir, "lerna.json")) {
		return &MonorepoInfo{Tool: "lerna"}
	}
	if fileExists(filepath.Join(dir, "turbo.json")) {
		info := &MonorepoInfo{Tool: "turborepo"}
		// Turborepo uses package.json or pnpm workspaces — try to get globs
		if globs := parsePackageJSONWorkspaces(dir); len(globs) > 0 {
			info.Globs = globs
		}
		return info
	}
	if fileExists(filepath.Join(dir, "nx.json")) {
		return &MonorepoInfo{Tool: "nx"}
	}

	return nil
}

// parsePnpmWorkspace hand-parses pnpm-workspace.yaml.
// The format is simple:
//
//	packages:
//	  - 'packages/*'
//	  - 'apps/*'
func parsePnpmWorkspace(dir string) []string {
	// #nosec G304 -- path is deterministic (dir + "pnpm-workspace.yaml").
	data, err := os.ReadFile(filepath.Join(dir, "pnpm-workspace.yaml"))
	if err != nil {
		return nil
	}

	var globs []string
	inPackages := false
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)

		if trimmed == "packages:" {
			inPackages = true
			continue
		}

		// A non-indented, non-empty line after "packages:" ends the section.
		if inPackages && trimmed != "" && !strings.HasPrefix(line, " ") && !strings.HasPrefix(line, "\t") {
			break
		}

		if inPackages && strings.HasPrefix(trimmed, "- ") {
			glob := strings.TrimPrefix(trimmed, "- ")
			glob = strings.Trim(glob, "'\"")
			if glob != "" {
				globs = append(globs, glob)
			}
		}
	}

	return globs
}

// parsePackageJSONWorkspaces extracts workspace globs from package.json.
// Supports both array form and {packages: [...]} form.
func parsePackageJSONWorkspaces(dir string) []string {
	// #nosec G304 -- path is deterministic (dir + "package.json").
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return nil
	}

	// Try array form: "workspaces": ["packages/*"]
	var arrayForm struct {
		Workspaces []string `json:"workspaces"`
	}
	if json.Unmarshal(data, &arrayForm) == nil && len(arrayForm.Workspaces) > 0 {
		return arrayForm.Workspaces
	}

	// Try object form: "workspaces": {"packages": ["packages/*"]}
	var objectForm struct {
		Workspaces struct {
			Packages []string `json:"packages"`
		} `json:"workspaces"`
	}
	if json.Unmarshal(data, &objectForm) == nil && len(objectForm.Workspaces.Packages) > 0 {
		return objectForm.Workspaces.Packages
	}

	return nil
}

// isCargoWorkspace checks if Cargo.toml contains a [workspace] section.
func isCargoWorkspace(dir string) bool {
	// #nosec G304 -- path is deterministic (dir + "Cargo.toml").
	data, err := os.ReadFile(filepath.Join(dir, "Cargo.toml"))
	if err != nil {
		return false
	}
	return bytes.Contains(data, []byte("[workspace]"))
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
