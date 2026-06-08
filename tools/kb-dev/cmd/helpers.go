package cmd

import (
	"errors"

	"github.com/kb-labs/dev/internal/config"
	"github.com/kb-labs/dev/internal/manager"
	"github.com/kb-labs/dev/internal/netoffset"
)

// errSilent is returned when the command has already printed an error message.
// It causes a non-zero exit code without cobra printing the error again.
var errSilent = errors.New("")

// loadManager creates a Manager from the config with full initialization.
func loadManager() (*manager.Manager, error) {
	result, err := FindConfig()
	if err != nil {
		return nil, err
	}

	cfg, err := loadConfig(result.ConfigPath)
	if err != nil {
		return nil, err
	}

	// Virtual-network port offset (isolated environments). --net-offset wins
	// over KB_NET_OFFSET. Shift the config (health-probe ports) AND pass the
	// value to spawned services so they bind the same shifted ports.
	offset := netOffset
	if offset == 0 {
		offset = netoffset.FromEnv()
	}
	cfg.ApplyOffset(offset)

	rootDir := config.RootDir(result.ConfigPath)
	mgr := manager.New(cfg, rootDir, result.ProjectDir)
	mgr.SetNetOffset(offset)

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
