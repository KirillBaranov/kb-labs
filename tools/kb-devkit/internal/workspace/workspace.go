// Package workspace discovers and classifies packages in the monorepo.
package workspace

import (
	"fmt"
	"path/filepath"

	"github.com/kb-labs/devkit/internal/config"
)

// Package represents a single package in the monorepo.
type Package struct {
	Name     string // @acme/core-runtime
	Dir      string // absolute path
	Category string // ts-lib, go-binary, site, ...
	Preset   string // node-lib, go-binary, ...
	Language string // typescript, go
	RelPath  string // relative to workspace root
}

// Workspace holds all discovered packages and the root path.
type Workspace struct {
	Root     string
	Packages []Package
	// byAbsPath is an O(1) lookup map: absolute file path → package.
	byAbsPath map[string]*Package
}

// New creates a Workspace by discovering and classifying packages.
func New(root string, cfg *config.DevkitConfig) (*Workspace, error) {
	pkgs, err := discoverPackages(root, cfg)
	if err != nil {
		return nil, fmt.Errorf("discover packages: %w", err)
	}

	ws := &Workspace{
		Root:      root,
		Packages:  pkgs,
		byAbsPath: make(map[string]*Package),
	}

	// Build reverse index: every file under a package dir maps to that package.
	// We only store the package dir itself as the key; callers use PackageByPath
	// which walks up the path to find the matching entry.
	for i := range ws.Packages {
		ws.byAbsPath[ws.Packages[i].Dir] = &ws.Packages[i]
	}

	return ws, nil
}

// FilterByName returns packages matching any of the given names.
func (ws *Workspace) FilterByName(names []string) []Package {
	set := make(map[string]bool, len(names))
	for _, n := range names {
		set[n] = true
	}
	var result []Package
	for _, p := range ws.Packages {
		if set[p.Name] {
			result = append(result, p)
		}
	}
	return result
}

// FilterByCategory returns packages in the given category.
func (ws *Workspace) FilterByCategory(category string) []Package {
	var result []Package
	for _, p := range ws.Packages {
		if p.Category == category {
			result = append(result, p)
		}
	}
	return result
}

// PackageByPath returns the package that owns the given absolute file path.
// It walks upward from the path until it finds a known package dir.
func (ws *Workspace) PackageByPath(absPath string) (*Package, bool) {
	cur := absPath
	for {
		if pkg, ok := ws.byAbsPath[cur]; ok {
			return pkg, true
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			break
		}
		cur = parent
	}
	return nil, false
}
