package cmd

import (
	"fmt"
	"os"

	"github.com/kb-labs/kb-monitor/internal/config"
	"github.com/kb-labs/kb-monitor/internal/ssh"
)

// loadConfig discovers and loads the deploy config.
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

// connectTarget dials SSH for the given target using its key_env variable.
func connectTarget(t config.Target) (*ssh.Client, error) {
	keyPEM := os.Getenv(t.SSH.KeyEnv)
	if keyPEM == "" {
		return nil, fmt.Errorf("$%s is empty — SSH key not set", t.SSH.KeyEnv)
	}
	client, err := ssh.New(t.SSH.Host, t.SSH.User, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("ssh connect: %w", err)
	}
	return client, nil
}

// sortedTargetNames returns targets sorted alphabetically, optionally filtered to one name.
func sortedTargetNames(cfg *config.Config, filter string) ([]string, error) {
	if filter != "" {
		if _, ok := cfg.Targets[filter]; !ok {
			return nil, fmt.Errorf("unknown target %q", filter)
		}
		return []string{filter}, nil
	}
	names := make([]string, 0, len(cfg.Targets))
	for name := range cfg.Targets {
		names = append(names, name)
	}
	// Sort for deterministic output.
	for i := 0; i < len(names); i++ {
		for j := i + 1; j < len(names); j++ {
			if names[i] > names[j] {
				names[i], names[j] = names[j], names[i]
			}
		}
	}
	return names, nil
}
