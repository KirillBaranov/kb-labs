package config

import (
	"fmt"
	"os"
	"path/filepath"
)

// candidates lists config file names in priority order.
// The KB Labs native location (.kb/devservices.yaml) is checked first,
// then the standalone fallback (devservices.yaml) for non-KB-Labs projects.
var candidates = []string{
	filepath.Join(".kb", "devservices.yaml"),
	"devservices.yaml",
	"devservices.yml",
}

// DiscoverResult holds the resolved config path and the project root.
// When devservices.yaml lives in a separate platform directory (via kb.config.jsonc
// platform.dir), ProjectDir points to the user's project (where kb-dev was invoked)
// rather than the platform directory — used to set KB_PROJECT_ROOT.
type DiscoverResult struct {
	ConfigPath string
	ProjectDir string // original invocation dir (may differ from RootDir(ConfigPath))
}

// Discover walks upward from dir looking for a known config file.
// Before the standard walk, it checks whether the current project has a
// kb.config.jsonc with a platform.dir — if so, devservices.yaml is resolved
// from the platform directory instead of the project tree.
func Discover(dir string) (DiscoverResult, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return DiscoverResult{}, fmt.Errorf("resolve dir: %w", err)
	}

	// Check for kb.config.jsonc pointing to a separate platform dir.
	if platformDir := findPlatformDir(abs); platformDir != "" {
		candidate := filepath.Join(platformDir, ".kb", "devservices.yaml")
		if _, err := os.Stat(candidate); err == nil {
			return DiscoverResult{ConfigPath: candidate, ProjectDir: abs}, nil
		}
	}

	search := abs
	for {
		for _, name := range candidates {
			candidate := filepath.Join(search, name)
			if _, err := os.Stat(candidate); err == nil {
				return DiscoverResult{ConfigPath: candidate, ProjectDir: RootDir(candidate)}, nil
			}
		}
		parent := filepath.Dir(search)
		if parent == search {
			break
		}
		search = parent
	}

	return DiscoverResult{}, fmt.Errorf(
		"no config found (searched %s upward); "+
			"create .kb/devservices.yaml or devservices.yaml",
		dir,
	)
}

// LoadFile reads and parses a config from an explicit path.
// Supported formats: .yaml and .yml.
func LoadFile(path string) (*Config, error) {
	switch filepath.Ext(path) {
	case ".yaml", ".yml":
		return loadYAML(path)
	default:
		return nil, fmt.Errorf("unsupported config format: %q (want .yaml or .yml)", filepath.Base(path))
	}
}

// RootDir returns the project root implied by a config path.
// For configs inside .kb/, it steps up one extra level to return the true root.
func RootDir(configPath string) string {
	abs, _ := filepath.Abs(configPath)
	dir := filepath.Dir(abs)
	// If the config lives inside .kb/, step up one more level.
	if filepath.Base(dir) == ".kb" {
		return filepath.Dir(dir)
	}
	return dir
}
