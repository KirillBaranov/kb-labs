// Package pm abstracts node package manager operations behind a common interface.
// Use Detect() to obtain the appropriate manager for the current environment.
package pm

import (
	"os"
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
	StoreDir string // optional: shared pnpm store dir (ignored by npm)
}

// Detect returns pnpm if available, otherwise npm.
// Registry priority: DetectOptions.Registry > KB_REGISTRY_URL env var > default (npm.org).
// KB_REGISTRY_URL allows CI to redirect installs to a local Verdaccio instance
// without requiring callers to pass --registry explicitly.
//
// KB_REGISTRY_URL is intentionally ignored when NPM_CONFIG_REGISTRY is already
// set in the environment (e.g. inside Docker where pnpm already has the correct
// registry configured). This prevents KB_REGISTRY_URL from inadvertently
// overriding a Docker-internal registry address with a host-side one.
func Detect(opts ...DetectOptions) PackageManager {
	var registry, storeDir string
	if len(opts) > 0 {
		registry = opts[0].Registry
		storeDir = opts[0].StoreDir
	}
	if registry == "" && os.Getenv("NPM_CONFIG_REGISTRY") == "" {
		registry = os.Getenv("KB_REGISTRY_URL")
	}
	if _, err := exec.LookPath("pnpm"); err == nil {
		return &PnpmManager{Registry: registry, StoreDir: storeDir}
	}
	return &NpmManager{Registry: registry}
}
