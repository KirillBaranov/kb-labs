// Package pm abstracts node package manager operations behind a common interface.
// Use Detect() to obtain the appropriate manager for the current environment.
package pm

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// Progress reports installation progress for a single step.
type Progress struct {
	Error   error
	Package string
	Line    string // raw output line for logging
	Done    bool
}

// CommandError keeps the useful tail of a package-manager failure. The
// launcher renders this compactly for humans while the complete stream is
// retained in the per-run log by the caller.
type CommandError struct {
	Command string
	Output  string
	Cause   error
}

func (e *CommandError) Error() string {
	if e == nil {
		return "<nil>"
	}
	if e.Output == "" {
		return fmt.Sprintf("%s: %v", e.Command, e.Cause)
	}
	return fmt.Sprintf("%s: %v\n%s", e.Command, e.Cause, e.Output)
}
func (e *CommandError) Unwrap() error { return e.Cause }

// FailureSummary extracts only the actionable package-manager tail. It keeps
// terminal diagnostics stable without making callers depend on a concrete PM.
func FailureSummary(err error) string {
	var commandErr *CommandError
	if !errors.As(err, &commandErr) {
		return ""
	}
	return strings.TrimSpace(commandErr.Output)
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
	// Restore reinstalls node_modules from the existing package.json/lockfile
	// in dir, without changing declared dependency versions.
	Restore(dir string, progress chan<- Progress) error
	// ListInstalled returns packages installed in dir.
	ListInstalled(dir string) ([]InstalledPackage, error)
}

// DetectOptions configures the package manager returned by Detect.
type DetectOptions struct {
	Registry         string            // optional: custom registry URL
	StoreDir         string            // optional: shared pnpm store dir (ignored by npm)
	PackageOverrides map[string]string // explicit platform-owned pins for this install wave
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
	var packageOverrides map[string]string
	if len(opts) > 0 {
		registry = opts[0].Registry
		storeDir = opts[0].StoreDir
		packageOverrides = cloneStringMap(opts[0].PackageOverrides)
	}
	if registry == "" && os.Getenv("NPM_CONFIG_REGISTRY") == "" {
		registry = os.Getenv("KB_REGISTRY_URL")
	}
	if _, err := exec.LookPath("pnpm"); err == nil {
		return &PnpmManager{Registry: registry, StoreDir: storeDir, PackageOverrides: packageOverrides}
	}
	return &NpmManager{Registry: registry, PackageOverrides: packageOverrides}
}

func cloneStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	clone := make(map[string]string, len(values))
	for key, value := range values {
		clone[key] = value
	}
	return clone
}
