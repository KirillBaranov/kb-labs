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

// readSSHKey resolves the private key PEM for the given SSHConfig.
// It checks key_path_env first (path to a key file), then falls back to key_env
// (raw PEM content). Returns an error if neither is set or the file cannot be read.
func readSSHKey(sshCfg config.SSHConfig) (string, error) {
	if sshCfg.KeyPathEnv != "" {
		if p := os.Getenv(sshCfg.KeyPathEnv); p != "" {
			data, err := os.ReadFile(p)
			if err != nil {
				return "", fmt.Errorf("read SSH key file $%s=%s: %w", sshCfg.KeyPathEnv, p, err)
			}
			return string(data), nil
		}
	}
	if sshCfg.KeyEnv != "" {
		if pem := os.Getenv(sshCfg.KeyEnv); pem != "" {
			return pem, nil
		}
	}
	hint := sshCfg.KeyPathEnv
	if hint == "" {
		hint = sshCfg.KeyEnv
	}
	return "", fmt.Errorf("SSH key not set: $%s is empty", hint)
}
