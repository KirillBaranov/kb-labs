package workspace

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// pnpmWorkspaceYAML is the minimal structure we need from pnpm-workspace.yaml.
type pnpmWorkspaceYAML struct {
	Packages []string `yaml:"packages"`
}

// readPnpmWorkspace reads glob patterns from pnpm-workspace.yaml.
func readPnpmWorkspace(root string) ([]string, error) {
	candidates := []string{
		filepath.Join(root, "pnpm-workspace.yaml"),
		filepath.Join(root, "pnpm-workspace.yml"),
	}

	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var ws pnpmWorkspaceYAML
		if err := yaml.Unmarshal(data, &ws); err != nil {
			return nil, fmt.Errorf("parse %s: %w", path, err)
		}
		return ws.Packages, nil
	}

	return nil, fmt.Errorf("no pnpm-workspace.yaml found in %s", root)
}

// packageJSONWorkspaces reads the "workspaces" field from root package.json.
type packageJSONWorkspaces struct {
	Workspaces []string `json:"workspaces"`
}

func readPackageJSONWorkspaces(root string) ([]string, error) {
	path := filepath.Join(root, "package.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("no pnpm-workspace.yaml or package.json found in %s", root)
	}

	var pkg packageJSONWorkspaces
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil, fmt.Errorf("parse package.json: %w", err)
	}

	if len(pkg.Workspaces) == 0 {
		return nil, fmt.Errorf("no workspaces defined in package.json")
	}

	return pkg.Workspaces, nil
}

// readPackageName returns the canonical name for a package directory.
// Resolution order:
//  1. "name" field in package.json
//  2. "module" directive in go.mod
//  3. directory basename
func readPackageName(dir string) string {
	// 1. package.json
	if data, err := os.ReadFile(filepath.Join(dir, "package.json")); err == nil {
		var pkg struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(data, &pkg); err == nil && pkg.Name != "" {
			return pkg.Name
		}
	}

	// 2. go.mod — use the module path as the package name
	if data, err := os.ReadFile(filepath.Join(dir, "go.mod")); err == nil {
		for _, line := range strings.SplitN(string(data), "\n", 10) {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "module ") {
				if mod := strings.TrimSpace(strings.TrimPrefix(line, "module ")); mod != "" {
					return mod
				}
			}
		}
	}

	// 3. fallback
	return filepath.Base(dir)
}
