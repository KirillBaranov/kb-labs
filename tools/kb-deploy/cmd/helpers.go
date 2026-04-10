package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/kb-labs/kb-deploy/internal/config"
)

// loadConfig discovers and loads the deploy config.
// Uses --config flag if set, otherwise walks up from cwd looking for .kb/deploy.yaml.
func loadConfig() (*config.Config, string, error) {
	var cfgPath string
	if configPath != "" {
		cfgPath = configPath
	} else {
		cwd, err := os.Getwd()
		if err != nil {
			return nil, "", fmt.Errorf("get cwd: %w", err)
		}
		cfgPath, err = config.Discover(cwd)
		if err != nil {
			return nil, "", err
		}
	}

	repoRoot := config.RepoRoot(cfgPath)

	cfg, err := config.Load(cfgPath, repoRoot)
	if err != nil {
		return nil, "", fmt.Errorf("load config %s: %w", cfgPath, err)
	}
	return cfg, repoRoot, nil
}

// stateFilePath returns the absolute path to state.json given the repo root.
func stateFilePath(repoRoot string) string {
	return filepath.Join(repoRoot, ".kb", "deploy", "state.json")
}
