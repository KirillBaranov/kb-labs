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

// Discover walks upward from dir looking for a known config file.
// It checks each directory level before moving to the parent, so
// the closest config wins. Returns the absolute path to the first
// match, or an error if nothing is found.
func Discover(dir string) (string, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", fmt.Errorf("resolve dir: %w", err)
	}

	for {
		for _, name := range candidates {
			candidate := filepath.Join(abs, name)
			if _, err := os.Stat(candidate); err == nil {
				return candidate, nil
			}
		}
		parent := filepath.Dir(abs)
		if parent == abs {
			break
		}
		abs = parent
	}

	return "", fmt.Errorf(
		"no config found (searched %s upward); "+
			"create .kb/dev.config.json or devservices.yaml",
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
