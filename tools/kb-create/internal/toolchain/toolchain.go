// Package toolchain defines the Node.js and package-manager contract used by
// generated KB Labs platforms.
package toolchain

import (
	"fmt"
	"os/exec"
	"strings"

	sharedtoolchain "github.com/kb-labs/clikit/toolchain"
)

const (
	// NodeMajor is the only Node.js major supported by the platform.
	NodeMajor = sharedtoolchain.SupportedNodeMajor
	// PnpmVersion is pinned into generated platform package.json files. The
	// launcher may update a user's pnpm to this exact version before install.
	PnpmVersion = sharedtoolchain.SupportedPnpm
)

type Status struct {
	NodeVersion string
	PnpmVersion string
}

func Inspect(manager string) (Status, error) {
	node, err := commandVersion("node")
	if err != nil {
		return Status{}, fmt.Errorf("read Node.js version: %w", err)
	}
	if manager != "pnpm" {
		return Status{NodeVersion: node}, nil
	}
	pnpm, err := commandVersion("pnpm")
	if err != nil {
		return Status{NodeVersion: node}, fmt.Errorf("read pnpm version: %w", err)
	}
	return Status{NodeVersion: node, PnpmVersion: pnpm}, nil
}

func Validate(s Status) error {
	if err := sharedtoolchain.ValidateNode(s.NodeVersion); err != nil {
		return err
	}
	if s.PnpmVersion == "" {
		return nil
	}
	return sharedtoolchain.ValidatePnpm(s.PnpmVersion)
}

// UpgradePnpm activates the version used by generated platforms. It prefers
// Corepack, but works on Node distributions where Corepack is not bundled.
func UpgradePnpm() error {
	if _, err := exec.LookPath("corepack"); err == nil {
		if out, runErr := exec.Command("corepack", "prepare", "pnpm@"+PnpmVersion, "--activate").CombinedOutput(); runErr == nil {
			return nil
		} else if strings.TrimSpace(string(out)) != "" {
			// Fall through to npm; the npm error below is more actionable when
			// neither mechanism is available.
		}
	}
	if _, err := exec.LookPath("npm"); err != nil {
		return fmt.Errorf("cannot update pnpm: neither corepack nor npm is available")
	}
	if out, err := exec.Command("npm", "install", "--global", "pnpm@"+PnpmVersion).CombinedOutput(); err != nil {
		return fmt.Errorf("install pnpm@%s: %s", PnpmVersion, strings.TrimSpace(string(out)))
	}
	return nil
}

func commandVersion(name string) (string, error) {
	out, err := exec.Command(name, "--version").Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}
