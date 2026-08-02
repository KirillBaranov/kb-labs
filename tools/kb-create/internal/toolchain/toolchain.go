// Package toolchain defines the Node.js and package-manager contract used by
// generated KB Labs platforms.
package toolchain

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

const (
	// NodeMajor is the minimum supported Node.js major. The platform targets
	// the current LTS line; newer supported majors are accepted as well.
	NodeMajor = 24
	// PnpmVersion is pinned into generated platform package.json files. The
	// launcher may update a user's pnpm to this exact version before install.
	PnpmVersion = "11.4.0"
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
	major, err := majorVersion(s.NodeVersion)
	if err != nil {
		return fmt.Errorf("unsupported Node.js version %q: %w", s.NodeVersion, err)
	}
	if major < NodeMajor {
		return fmt.Errorf("Node.js %s is unsupported; KB Labs requires Node.js %d or newer", s.NodeVersion, NodeMajor)
	}
	if s.PnpmVersion == "" {
		return nil
	}
	pnpmMajor, err := majorVersion(s.PnpmVersion)
	if err != nil || pnpmMajor != 11 {
		return fmt.Errorf("pnpm %s is unsupported; KB Labs requires pnpm %s", s.PnpmVersion, PnpmVersion)
	}
	return nil
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

func majorVersion(version string) (int, error) {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	part := version
	if i := strings.IndexByte(part, '.'); i >= 0 {
		part = part[:i]
	}
	major, err := strconv.Atoi(part)
	if err != nil {
		return 0, fmt.Errorf("invalid semantic version")
	}
	return major, nil
}
