package cmd

import (
	"errors"

	"github.com/kb-labs/dev/internal/config"
	"github.com/kb-labs/dev/internal/manager"
)

// errSilent is returned when the command has already printed an error message.
// It causes a non-zero exit code without cobra printing the error again.
var errSilent = errors.New("")

// loadManager creates a Manager from the config with full initialization.
func loadManager() (*manager.Manager, error) {
	cfgPath, err := FindConfigPath()
	if err != nil {
		return nil, err
	}

	cfg, err := loadConfig(cfgPath)
	if err != nil {
		return nil, err
	}

	rootDir := config.RootDir(cfgPath)
	mgr := manager.New(cfg, rootDir)

	// Resolve environment (node/pnpm paths).
	mgr.ResolveEnv()

	// Reconcile PID files with running processes.
	_ = mgr.Reconcile()

	return mgr, nil
}

// loadConfig reads and parses the config from the given path.
func loadConfig(path string) (*config.Config, error) {
	return config.LoadFile(path)
}
