// Package pm abstracts node package manager operations behind a common interface.
// Use Detect() to obtain the appropriate manager for the current environment.
package pm

import (
	"os/exec"
)

// Progress reports installation progress for a single step.
type Progress struct {
	Error   error
	Package string
	Line    string // raw output line for logging
	Done    bool
}

// InstalledPackage describes a package found in node_modules.
type InstalledPackage struct {
	Name    string
	Version string
}

// PackageManager abstracts npm/pnpm/bun install operations.
// All methods run synchronously and stream progress via the channel.
// The channel is closed when the operation completes.
type PackageManager interface {
	// Name returns "npm" or "pnpm".
	Name() string
	// RegistryURL returns the custom registry URL, or empty string for the default.
	RegistryURL() string
	// Install installs the given packages into dir/node_modules.
	Install(dir string, pkgs []string, progress chan<- Progress) error
	// Update updates already-installed packages to their latest versions.
	Update(dir string, pkgs []string, progress chan<- Progress) error
	// ListInstalled returns packages installed in dir.
	ListInstalled(dir string) ([]InstalledPackage, error)
}

// DetectOptions configures the package manager returned by Detect.
type DetectOptions struct {
	Registry string // optional: custom registry URL
}

// Detect returns pnpm if available, otherwise npm.
func Detect(opts ...DetectOptions) PackageManager {
	var registry string
	if len(opts) > 0 {
		registry = opts[0].Registry
	}
	if _, err := exec.LookPath("pnpm"); err == nil {
		return &PnpmManager{Registry: registry}
	}
	return &NpmManager{Registry: registry}
}
