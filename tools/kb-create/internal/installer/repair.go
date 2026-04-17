package installer

import (
	"context"
	"fmt"
	"os/exec"

	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/platform"
)

// RepairCLI re-creates the kb CLI wrapper in ~/.local/bin.
// Safe to call when bin.js exists but the wrapper was deleted or is broken.
func (ins *Installer) RepairCLI(platformDir string) error {
	ins.symlinkCLI(platformDir)
	return nil
}

// RepairBinaries re-downloads Go binaries (kb-dev, kb-devkit, etc.)
// from GitHub Releases into platformDir/bin/ and re-symlinks them into PATH.
func (ins *Installer) RepairBinaries(platformDir string) ([]string, error) {
	m, err := manifest.LoadDefault()
	if err != nil {
		return nil, fmt.Errorf("load manifest: %w", err)
	}
	if len(m.Binaries) == 0 {
		return nil, nil
	}
	return ins.installBinaries(platformDir, m.Binaries)
}

// RepairNodeModules runs the detected package manager's install in platformDir,
// restoring node_modules from the existing package.json / lockfile.
func (ins *Installer) RepairNodeModules(platformDir string) error {
	pmName := ins.PM.Name()
	ins.Log.Printf("  running %s install in %s", pmName, platformDir)
	// #nosec G204 -- pmName is from pm.Detect(), a fixed set of known values
	cmd := exec.CommandContext(context.Background(), pmName, "install")
	cmd.Dir = platformDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s install failed: %w\n%s", pmName, err, out)
	}
	return nil
}

// RepairPATH ensures the user bin dir is in PATH permanently and for the
// current session. Returns a hint command if a terminal restart is needed.
func RepairPATH() (hint string, err error) {
	binDir, err := platform.UserBinDir()
	if err != nil {
		return "", fmt.Errorf("resolve bin dir: %w", err)
	}
	result := platform.EnsureInPATH(binDir)
	if result.AlreadySet {
		return "", nil
	}
	return result.HintCmd, nil
}
