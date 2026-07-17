package cmd

import (
	"errors"
	"path/filepath"

	"github.com/kb-labs/dev/internal/config"
	"github.com/kb-labs/dev/internal/manager"
	"github.com/kb-labs/dev/internal/netoffset"
)

// errSilent is returned when the command has already printed an error message.
// It causes a non-zero exit code without cobra printing the error again.
var errSilent = errors.New("")

// loadManager creates a Manager from the config with full initialization.
//
// Offset resolution priority: explicit --net-offset/--force > KB_NET_OFFSET env
// > (if this rootDir is a registered project) its stable alias-derived offset
// > 0. The alias case keeps ports stable and non-colliding whether the project
// is entered via `kb-dev switch <alias>` or a plain `cd project && kb-dev start`.
func loadManager() (*manager.Manager, error) {
	result, err := FindConfig()
	if err != nil {
		return nil, err
	}

	cfg, err := loadConfig(result.ConfigPath)
	if err != nil {
		return nil, err
	}

	rootDir := config.RootDir(result.ConfigPath)

	offset := netOffset
	if offset == 0 {
		offset = netoffset.FromEnv()
	}
	if offset == 0 {
		if alias, ok := lookupRegisteredAlias(result.ProjectDir); ok {
			if resolved, rerr := resolveOffsetForAlias(alias, cfg, rootDir, result.ProjectDir); rerr == nil {
				offset = resolved
			}
			// Resolution failure (e.g. no free ports found) falls back to
			// offset 0 rather than blocking a plain `kb-dev start` — `switch`
			// is the command that treats this as a hard error (see switch.go).
		}
	}
	cfg.ApplyOffset(offset)

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

// loadManagerForProject builds a Manager for an explicit project (configPath
// + rootDir + projectDir), independent of CWD — used by `switch`/`projects`
// to operate on OTHER registered projects, not just the one kb-dev was
// invoked from. offset must already be resolved by the caller (see
// resolveOffsetForAlias) since callers differ on how to handle resolution
// failure.
func loadManagerForProject(configPath, projectDir string, offset int) (*manager.Manager, error) {
	cfg, err := loadConfig(configPath)
	if err != nil {
		return nil, err
	}
	cfg.ApplyOffset(offset)

	rootDir := config.RootDir(configPath)
	mgr := manager.New(cfg, rootDir, projectDir)
	mgr.SetNetOffset(offset)
	mgr.ResolveEnv()
	_ = mgr.Reconcile()

	return mgr, nil
}

// lookupRegisteredAlias returns the alias a project is registered under, if
// any. Matches on projectDir, not rootDir: `register` stores the directory
// the user ran it from (their project dir), which in the common shared-platform
// topology differs from rootDir (where devservices.yaml actually lives — the
// platform dir, identical for every project sharing that platform). Matching
// on rootDir there would either never match or match the wrong project.
//
// Cheap best-effort lookup: any failure to resolve the platform dir or read
// the registry is treated as "not registered" rather than an error, so
// unregistered projects keep working exactly as before this feature existed.
func lookupRegisteredAlias(projectDir string) (string, bool) {
	return aliasForPath(projectDir)
}

// aliasForPath resolves the platform registry and looks up which alias (if
// any) a given project path is registered under.
func aliasForPath(projectDir string) (string, bool) {
	platformDir, err := config.ResolvePlatformDir("")
	if err != nil {
		return "", false
	}
	projects, err := config.ReadProjects(platformDir)
	if err != nil {
		return "", false
	}
	absProject, err := filepath.Abs(projectDir)
	if err != nil {
		return "", false
	}
	for alias, path := range projects {
		if absPath, aerr := filepath.Abs(path); aerr == nil && absPath == absProject {
			return alias, true
		}
	}
	return "", false
}

// resolveOffsetForAlias derives and verifies a stable net-offset for a
// registered project, caching the result under its project-namespaced state
// dir (see manager.StateDir) so repeated starts don't re-probe ports
// unnecessarily, and so two projects sharing one platform never share a cache
// file.
func resolveOffsetForAlias(alias string, cfg *config.Config, rootDir, projectDir string) (int, error) {
	pidDir := manager.StateDir(rootDir, projectDir, cfg.Settings.PIDDir)
	basePorts := cfg.TCPPorts()
	return netoffset.Resolve(alias, pidDir, func(offset int) []int {
		shifted := make([]int, len(basePorts))
		for i, p := range basePorts {
			shifted[i] = p + offset
		}
		return shifted
	})
}
