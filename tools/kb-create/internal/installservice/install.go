// Package installservice installs a single service into a versioned release
// directory under the platform root, without touching the active symlink.
// The atomic swap to make the new release current is performed by the swap
// package in Phase 3 (ADR-0014).
package installservice

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/kb-labs/create/internal/pm"
	"github.com/kb-labs/create/internal/releases"
)

// Options configures a single install-service invocation.
type Options struct {
	// ServicePkg is the npm package name, e.g. "@kb-labs/gateway".
	ServicePkg string
	// Version is the resolved semver to install, e.g. "1.2.3".
	Version string
	// Adapters maps logical name (usually role) → npm spec (with version),
	// e.g. {"llm": "@kb-labs/adapters-openai@0.4.1"}.
	Adapters map[string]string
	// Plugins maps package name → version spec. Optional.
	Plugins map[string]string
	// PlatformDir is the platform root, e.g. ~/kb-platform.
	PlatformDir string
	// Registry optionally overrides the default npm registry.
	Registry string
	// ReleaseID lets the caller pin the directory name. Empty = compute deterministically.
	ReleaseID string
	// KeepReleases is the GC retention count for this service. Must be >= 1.
	// Current and Previous are protected in addition to this count (D20).
	KeepReleases int

	// Stdout / Stderr receive pm progress output. Defaults to os.Stdout/Stderr.
	Stdout, Stderr io.Writer
}

// Result reports the outcome of Install.
type Result struct {
	// ReleaseID is the final id of the installed (or existing) release.
	ReleaseID string
	// ReleaseDir is the absolute path to releases/<id>/.
	ReleaseDir string
	// NoOp is true when the release already existed and was complete on entry.
	NoOp bool
	// Evicted lists release ids removed from the index by GC during this install.
	// Their directories have already been deleted.
	Evicted []string
}

const releaseSchema = "kb.release/1"

// defaultKeepReleases is the GC retention count when the caller doesn't specify
// one. On a single VPS, current + previous (both protected) plus one spare is
// plenty; a lower default keeps the releases tree small. Overridable per call.
const defaultKeepReleases = 2

// minFreeBytes is the pre-install disk-space floor. install-service refuses to
// start a download when the releases filesystem has less than this available,
// failing fast with a clear error instead of half-writing a release into a full
// disk (which previously cascaded into pnpm failures, a crashed MongoDB, and an
// unwritable devservices.yaml). A cold first install of one service is ~600MB;
// 2 GiB leaves headroom for the download plus the brief install peak.
const minFreeBytes = 2 << 30 // 2 GiB

// pnpmStoreSubdir is the shared pnpm store location under the platform root. It
// lives on the same filesystem as releases/ so pnpm hardlinks store objects into
// each release's node_modules instead of copying them.
const pnpmStoreSubdir = ".kb/pnpm-store"

// Install installs the service into releases/<id>/ under opts.PlatformDir.
//
// High-level steps:
//  1. Validate options.
//  2. Ensure releases/ and services/ share a filesystem (D21).
//  3. Compute release id deterministically if not provided (D3).
//  4. If releases/<id>/ exists and is complete → no-op.
//     4.5. Evict releases beyond keep, then guard free disk space.
//  5. Create releases/<id>/ with an .incomplete marker.
//  6. Write package.json pinning service + adapters + plugins.
//  7. Run pnpm install in that directory (shared store → hardlinked deps).
//  8. Write release.json with integrity digest.
//  9. Remove .incomplete.
//  10. Update releases.json, run GC, save.
//  11. Remove evicted directories from disk.
func Install(ctx context.Context, opts Options) (*Result, error) {
	if err := opts.validate(); err != nil {
		return nil, err
	}
	if opts.Stdout == nil {
		opts.Stdout = os.Stdout
	}
	if opts.Stderr == nil {
		opts.Stderr = os.Stderr
	}

	releasesDir := filepath.Join(opts.PlatformDir, "releases")
	servicesDir := filepath.Join(opts.PlatformDir, "services")
	if err := releases.EnsureSameFilesystem(releasesDir, servicesDir); err != nil {
		return nil, err
	}

	releaseID := opts.ReleaseID
	if releaseID == "" {
		releaseID = releases.ComputeID(opts.ServicePkg, opts.Version, opts.Adapters, opts.Plugins)
	}
	releaseDir := filepath.Join(releasesDir, releaseID)
	incompleteMarker := filepath.Join(releaseDir, ".incomplete")

	// Step 4 — idempotent no-op check.
	if _, err := os.Stat(releaseDir); err == nil {
		if _, mErr := os.Stat(incompleteMarker); errors.Is(mErr, os.ErrNotExist) {
			// Directory exists and no incomplete marker → already installed.
			return &Result{ReleaseID: releaseID, ReleaseDir: releaseDir, NoOp: true}, nil
		}
		// Stale incomplete install — wipe and retry.
		if err := os.RemoveAll(releaseDir); err != nil {
			return nil, fmt.Errorf("clean stale release %s: %w", releaseID, err)
		}
	}

	// Step 4.5 — evict beyond keep BEFORE the download, then guard free space.
	//
	// Evicting first removes the old "peak = existing + new" window: stale
	// releases are freed before pnpm pulls the next one. The disk guard is the
	// hard backstop — refuse to start rather than half-write into a full disk.
	preEvicted, err := pruneBeyondKeep(opts.PlatformDir, opts.ServicePkg, opts.KeepReleases, opts.Stderr)
	if err != nil {
		return nil, err
	}
	if free, err := releases.FreeBytes(releasesDir); err != nil {
		return nil, err
	} else if free < minFreeBytes {
		return nil, fmt.Errorf(
			"ERR_INSUFFICIENT_DISK: %d MiB free on %s, need at least %d MiB to install %s@%s. "+
				"Free space (old releases, docker, caches) or lower keep-releases.",
			free>>20, releasesDir, int64(minFreeBytes)>>20, opts.ServicePkg, opts.Version,
		)
	}

	// Step 5 — fresh dir + marker.
	if err := os.MkdirAll(releaseDir, 0o750); err != nil {
		return nil, fmt.Errorf("create release dir: %w", err)
	}
	// #nosec G306 -- marker file inside release dir.
	if err := os.WriteFile(incompleteMarker, []byte("in-progress\n"), 0o644); err != nil {
		return nil, fmt.Errorf("write .incomplete marker: %w", err)
	}

	// Step 6 — package.json pinning all deps.
	pkgs, pkgJSON, err := buildPackageJSON(releaseID, opts)
	if err != nil {
		return nil, err
	}
	pkgPath := filepath.Join(releaseDir, "package.json")
	// #nosec G306 -- package.json readable in release tree.
	if err := os.WriteFile(pkgPath, pkgJSON, 0o644); err != nil {
		return nil, fmt.Errorf("write package.json: %w", err)
	}

	// Step 7 — pnpm install.
	if err := runInstall(ctx, releaseDir, pkgs, opts); err != nil {
		return nil, err
	}

	// Step 8 — release.json.
	integrity := releases.HashInputs(opts.ServicePkg, opts.Version, opts.Adapters, opts.Plugins)
	rec := releaseRecord{
		Schema:      releaseSchema,
		ID:          releaseID,
		Service:     fmt.Sprintf("%s@%s", opts.ServicePkg, opts.Version),
		Adapters:    opts.Adapters,
		Plugins:     opts.Plugins,
		Integrity:   "sha256-" + integrity,
		InstalledAt: time.Now().UTC().Format(time.RFC3339),
	}
	if err := writeJSON(filepath.Join(releaseDir, "release.json"), rec); err != nil {
		return nil, err
	}

	// Step 9 — remove incomplete marker; release is now complete.
	if err := os.Remove(incompleteMarker); err != nil {
		return nil, fmt.Errorf("remove .incomplete: %w", err)
	}

	// Step 10 — index + GC.
	//
	// Legacy note (D2): on a fresh host that still has a legacy node_modules
	// and/or marketplace.lock from the pre-release era, releases.json simply
	// does not exist yet. Load() returns an empty store and we populate it
	// as usual — no explicit migration step. The marketplace plugin retains
	// read-only access to marketplace.lock for backward compatibility during
	// the deprecation window (tracked for removal in N+2).
	store, err := releases.Load(opts.PlatformDir)
	if err != nil {
		return nil, err
	}
	store.AppendRelease(releases.Release{
		ID:        releaseID,
		Service:   opts.ServicePkg,
		Version:   opts.Version,
		Adapters:  opts.Adapters,
		Plugins:   opts.Plugins,
		CreatedAt: time.Now().UTC(),
		Source:    "install-service",
	})
	evicted, err := store.GC(opts.ServicePkg, opts.KeepReleases)
	if err != nil {
		return nil, fmt.Errorf("gc: %w", err)
	}
	if err := store.Save(); err != nil {
		return nil, err
	}

	// Step 11 — physically remove evicted release dirs.
	for _, id := range evicted {
		dir := filepath.Join(releasesDir, id)
		if err := os.RemoveAll(dir); err != nil {
			// Non-fatal: index already updated. Log and continue.
			fmt.Fprintf(opts.Stderr, "warning: evicted release %s could not be removed: %v\n", id, err)
		}
	}

	return &Result{
		ReleaseID:  releaseID,
		ReleaseDir: releaseDir,
		Evicted:    append(preEvicted, evicted...),
	}, nil
}

// pruneBeyondKeep evicts releases for service beyond the keep count (current and
// previous stay protected) and physically removes their dirs, before a new
// download begins. Returns the evicted ids. A nil store (no releases.json yet)
// is a clean no-op.
func pruneBeyondKeep(platformDir, service string, keep int, stderr io.Writer) ([]string, error) {
	store, err := releases.Load(platformDir)
	if err != nil {
		return nil, err
	}
	evicted, err := store.GC(service, keep)
	if err != nil {
		return nil, fmt.Errorf("pre-install gc: %w", err)
	}
	if len(evicted) == 0 {
		return nil, nil
	}
	if err := store.Save(); err != nil {
		return nil, err
	}
	releasesDir := filepath.Join(platformDir, "releases")
	for _, id := range evicted {
		if err := os.RemoveAll(filepath.Join(releasesDir, id)); err != nil {
			fmt.Fprintf(stderr, "warning: pre-evicted release %s could not be removed: %v\n", id, err)
		}
	}
	return evicted, nil
}

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

func (o *Options) validate() error {
	if o.ServicePkg == "" {
		return errors.New("ServicePkg is required")
	}
	if o.Version == "" {
		return errors.New("Version is required")
	}
	if o.PlatformDir == "" {
		return errors.New("PlatformDir is required")
	}
	if o.KeepReleases < 1 {
		o.KeepReleases = defaultKeepReleases
	}
	return nil
}

// releaseRecord is the persisted shape of release.json.
type releaseRecord struct {
	Schema      string            `json:"schema"`
	ID          string            `json:"id"`
	Service     string            `json:"service"`
	Adapters    map[string]string `json:"adapters,omitempty"`
	Plugins     map[string]string `json:"plugins,omitempty"`
	Integrity   string            `json:"integrity"`
	InstalledAt string            `json:"installedAt"`
}

// buildPackageJSON assembles the package.json for the release dir and returns
// the list of specs to pass to pm.Install.
func buildPackageJSON(releaseID string, opts Options) ([]string, []byte, error) {
	deps := map[string]string{
		opts.ServicePkg: opts.Version,
	}
	specs := []string{fmt.Sprintf("%s@%s", opts.ServicePkg, opts.Version)}

	for _, spec := range opts.Adapters {
		name, ver, err := splitSpec(spec)
		if err != nil {
			return nil, nil, fmt.Errorf("adapter %q: %w", spec, err)
		}
		deps[name] = ver
		specs = append(specs, spec)
	}
	for name, ver := range opts.Plugins {
		deps[name] = ver
		specs = append(specs, fmt.Sprintf("%s@%s", name, ver))
	}

	content := map[string]interface{}{
		"name":         "kb-release-" + releaseID,
		"version":      "0.0.0",
		"private":      true,
		"dependencies": deps,
	}
	data, err := json.MarshalIndent(content, "", "  ")
	if err != nil {
		return nil, nil, fmt.Errorf("marshal package.json: %w", err)
	}
	return specs, append(data, '\n'), nil
}

// splitSpec parses "@scope/name@version" into name and version.
func splitSpec(spec string) (name, version string, err error) {
	// Find the last "@" that is not at index 0 (scoped packages start with @).
	for i := len(spec) - 1; i > 0; i-- {
		if spec[i] == '@' {
			return spec[:i], spec[i+1:], nil
		}
	}
	return "", "", fmt.Errorf("spec missing @version: %s", spec)
}

func runInstall(_ context.Context, dir string, pkgs []string, opts Options) error {
	storeDir := filepath.Join(opts.PlatformDir, pnpmStoreSubdir)
	mgr := pm.Detect(pm.DetectOptions{Registry: opts.Registry, StoreDir: storeDir})

	progress := make(chan pm.Progress, 32)
	done := make(chan error, 1)

	go func() {
		done <- mgr.Install(dir, pkgs, progress)
		close(progress)
	}()

	for p := range progress {
		if p.Line != "" {
			fmt.Fprintln(opts.Stdout, p.Line)
		}
	}
	if err := <-done; err != nil {
		return fmt.Errorf("%s install: %w", mgr.Name(), err)
	}
	return nil
}

func writeJSON(path string, v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", filepath.Base(path), err)
	}
	// #nosec G306 -- platform state file.
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", filepath.Base(path), err)
	}
	return nil
}
