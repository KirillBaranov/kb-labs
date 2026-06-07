package releases

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kb-labs/clikit/diag"

	"github.com/kb-labs/create/internal/devservices"
)

// ServiceShort returns the service directory name (part after @scope/).
// Used to build <platformDir>/services/<name>/.
func ServiceShort(servicePkg string) string {
	return shortName(servicePkg)
}

// Swap points services/<service>/current at releases/<releaseID>/ atomically.
// The previously-current release (if any) becomes previous.
//
// Concurrency: Store operations take the releases lock; symlink updates are
// POSIX-atomic via rename(). Callers should not hold the lock across Swap.
//
// The service short name is derived via shortName(servicePkg) so callers pass
// the npm package name (e.g. "@kb-labs/gateway"), not the short form.
// Swap returns an optional non-fatal warning (e.g. the release shipped no
// service manifest, so it could not auto-register with kb-dev) alongside a
// fatal error. Callers should surface the warning — it must never be silent.
func Swap(platformDir, servicePkg, releaseID string, envOverrides map[string]string) (*diag.Diag, error) {
	if releaseID == "" {
		return nil, errors.New("Swap: releaseID is required")
	}
	releasesDir := filepath.Join(platformDir, "releases")
	servicesDir := filepath.Join(platformDir, "services")
	if err := EnsureSameFilesystem(releasesDir, servicesDir); err != nil {
		return nil, err
	}

	// Verify target release directory exists.
	releaseDir := filepath.Join(releasesDir, releaseID)
	if _, err := os.Stat(releaseDir); err != nil {
		return nil, fmt.Errorf("release %q not found: %w", releaseID, err)
	}

	svcDir := filepath.Join(servicesDir, ServiceShort(servicePkg))
	if err := os.MkdirAll(svcDir, 0o750); err != nil {
		return nil, fmt.Errorf("create service dir: %w", err)
	}

	currentPath := filepath.Join(svcDir, "current")
	previousPath := filepath.Join(svcDir, "previous")
	newCurrentPath := filepath.Join(svcDir, "current.new")

	// Snapshot old current (may be absent on first swap).
	oldCurrentTarget, _ := os.Readlink(currentPath)

	// Build symlink target as a relative path so the services/ tree is movable.
	// services/<short>/current → ../../releases/<id>
	relTarget := filepath.Join("..", "..", "releases", releaseID)

	// Create current.new, then rename over current — atomic on POSIX.
	_ = os.Remove(newCurrentPath) // ignore ENOENT
	if err := os.Symlink(relTarget, newCurrentPath); err != nil {
		return nil, fmt.Errorf("create current.new symlink: %w", err)
	}
	if err := os.Rename(newCurrentPath, currentPath); err != nil {
		_ = os.Remove(newCurrentPath)
		return nil, fmt.Errorf("rename current: %w", err)
	}

	// Update previous to point at oldCurrentTarget (if any).
	if oldCurrentTarget != "" {
		_ = os.Remove(previousPath)
		if err := os.Symlink(oldCurrentTarget, previousPath); err != nil {
			// Non-fatal: current is already updated atomically; previous is a convenience.
			// Log via returned error so callers can warn; symlink state is still consistent.
			return nil, fmt.Errorf("update previous symlink: %w", err)
		}
	}

	// Update releases.json index.
	store, err := Load(platformDir)
	if err != nil {
		return nil, fmt.Errorf("reload store: %w", err)
	}
	oldID := idFromSymlinkTarget(oldCurrentTarget)
	if oldID != "" {
		store.Previous[servicePkg] = oldID
	}
	store.Current[servicePkg] = releaseID
	if err := store.Save(); err != nil {
		return nil, err
	}

	// Update devservices.yaml so `kb-dev` can start/restart/health-check this
	// service via the stable `current` symlink. A missing manifest yields a
	// non-fatal warning (returned, not swallowed) — the release is swapped, but
	// the operator must know it won't auto-register.
	return updateDevservices(platformDir, servicePkg, releaseID, envOverrides)
}

// updateDevservices reads the service manifest from the swapped release and
// upserts the matching entry in <platformDir>/.kb/devservices.yaml. Returns a
// non-fatal warning Diag (not nil) when the release ships no manifest, so the
// "service won't auto-register" condition is visible rather than silent.
func updateDevservices(platformDir, servicePkg, releaseID string, envOverrides map[string]string) (*diag.Diag, error) {
	manifestPath := filepath.Join(platformDir, "releases", releaseID,
		"node_modules", servicePkg, "dist", "manifest.json")
	if _, err := os.Stat(manifestPath); errors.Is(err, os.ErrNotExist) {
		return diag.New("ERR_MANIFEST_MISSING",
			fmt.Sprintf("service %s was swapped but not registered with kb-dev", servicePkg),
			diag.WithReason("the release ships no dist/manifest.json, so kb-create cannot build its devservices.yaml entry"),
			diag.WithHint("add dist/manifest.json to the service package (the tsup node preset emits it for kb.service manifests), or add the entry to .kb/devservices.yaml manually"),
			diag.WithMeta(map[string]any{"manifestPath": manifestPath, "fatal": false}),
		), nil
	} else if err != nil {
		return nil, fmt.Errorf("stat manifest: %w", err)
	}

	manifest, err := devservices.LoadManifest(manifestPath)
	if err != nil {
		return nil, err
	}
	serviceShort := ServiceShort(servicePkg)
	id, entry := devservices.EntryForSwap(platformDir, servicePkg, serviceShort, manifest, envOverrides)

	file, err := devservices.Load(platformDir)
	if err != nil {
		return nil, err
	}
	if file.Name == "" {
		file.Name = "KB Labs Platform"
	}
	file.Upsert(id, entry)
	if err := file.Save(platformDir); err != nil {
		return nil, err
	}
	return nil, nil
}

// Rollback swaps current back to previous. Returns an actionable error if
// previous is absent (first install, or GC'd beyond the retention window).
func Rollback(platformDir, servicePkg string) (*diag.Diag, error) {
	svcDir := filepath.Join(platformDir, "services", ServiceShort(servicePkg))
	previousPath := filepath.Join(svcDir, "previous")
	target, err := os.Readlink(previousPath)
	if err != nil {
		return nil, fmt.Errorf("no previous release for %s (has a successful install happened twice?): %w",
			servicePkg, err)
	}
	prevID := idFromSymlinkTarget(target)
	if prevID == "" {
		return nil, fmt.Errorf("previous symlink for %s is malformed: %q", servicePkg, target)
	}
	// Rollback re-registers with manifest-default env (no deploy-time overrides
	// available here). This is a recovery state — the operator re-applies the
	// forward deploy afterwards, which restores any per-service env overrides.
	return Swap(platformDir, servicePkg, prevID, nil)
}

// CurrentReleaseID returns the id of the release the current symlink points at.
// Empty string + nil error means "no current symlink" (fresh install scenario).
func CurrentReleaseID(platformDir, servicePkg string) (string, error) {
	svcDir := filepath.Join(platformDir, "services", ServiceShort(servicePkg))
	target, err := os.Readlink(filepath.Join(svcDir, "current"))
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return idFromSymlinkTarget(target), nil
}

// idFromSymlinkTarget extracts the release id from "../../releases/<id>" or any
// path whose last segment is the id. Returns "" when the target does not point
// into releases/ (safety against misconfiguration).
func idFromSymlinkTarget(target string) string {
	target = strings.TrimSuffix(target, string(os.PathSeparator))
	base := filepath.Base(target)
	if base == "." || base == "/" || base == "" {
		return ""
	}
	return base
}
