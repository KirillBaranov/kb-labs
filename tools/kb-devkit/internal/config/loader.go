package config

import (
	"fmt"
	"os"
	"path/filepath"
)

// candidates lists config file names in priority order.
var candidates = []string{
	"devkit.yaml",
	"devkit.yml",
}

// Discover walks upward from dir looking for a devkit.yaml file.
// Returns the absolute path to the first match, or an error.
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
		"no devkit.yaml found (searched %s upward); create one or run: kb-devkit init",
		dir,
	)
}

// LoadFile reads and parses a devkit.yaml from an explicit path.
func LoadFile(path string) (*DevkitConfig, error) {
	ext := filepath.Ext(path)
	switch ext {
	case ".yaml", ".yml":
		return loadYAML(path)
	default:
		return nil, fmt.Errorf("unsupported config format: %q (want .yaml or .yml)", filepath.Base(path))
	}
}

// RootDir returns the workspace root implied by a config path.
func RootDir(configPath string) string {
	abs, _ := filepath.Abs(configPath)
	return filepath.Dir(abs)
}
