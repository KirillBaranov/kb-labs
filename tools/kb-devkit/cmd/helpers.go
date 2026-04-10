package cmd

import (
	"fmt"
	"os"

	"github.com/kb-labs/devkit/internal/config"
	"github.com/kb-labs/devkit/internal/workspace"
)

// loadWorkspace discovers config, loads devkit.yaml, and builds the workspace.
// Equivalent to kb-dev's loadManager().
func loadWorkspace() (*workspace.Workspace, *config.DevkitConfig, error) {
	dir, err := os.Getwd()
	if err != nil {
		return nil, nil, fmt.Errorf("cannot determine working directory: %w", err)
	}

	cfgPath := configPath
	if cfgPath == "" {
		cfgPath, err = config.Discover(dir)
		if err != nil {
			return nil, nil, err
		}
	}

	cfg, err := config.LoadFile(cfgPath)
	if err != nil {
		return nil, nil, fmt.Errorf("load config: %w", err)
	}

	root := config.RootDir(cfgPath)

	// --depth flag overrides devkit.yaml maxDepth.
	if depthFlag > 0 {
		cfg.Workspace.MaxDepth = depthFlag
	}

	ws, err := workspace.New(root, cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("discover workspace: %w", err)
	}

	return ws, cfg, nil
}
