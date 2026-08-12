// axes_e2e_test.go covers the SDK/Platform version-axis mechanism
// (--sdk-version/--sdk-channel, --platform-version/--platform-channel,
// update's sticky channel, and the doctor binary-symlink check) against the
// real compiled kb-create binary, following the same conventions as
// e2e_test.go: fast tests run unconditionally, real-install tests are
// skipped with -short.
package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── fast: flag validation, no network ────────────────────────────────────────

func TestAxisFlagsMutualExclusivity(t *testing.T) {
	bin := binary(t)
	projectDir := t.TempDir()
	out, code := run(t, bin, projectDir, "--yes",
		"--sdk-version", "1.2.3", "--sdk-channel", "canary",
		"--platform", t.TempDir(),
	)
	if code == 0 {
		t.Fatalf("expected failure for --sdk-version + --sdk-channel together, got success:\n%s", out)
	}
	if !strings.Contains(out, "mutually exclusive") {
		t.Errorf("expected a mutual-exclusivity error, got:\n%s", out)
	}
}

func TestAxisFlagsInvalidChannelRejected(t *testing.T) {
	bin := binary(t)
	projectDir := t.TempDir()
	out, code := run(t, bin, projectDir, "--yes",
		"--platform-channel", "nightly",
		"--platform", t.TempDir(),
	)
	if code == 0 {
		t.Fatalf("expected failure for an invalid channel, got success:\n%s", out)
	}
	if !strings.Contains(out, `"stable" or "canary"`) {
		t.Errorf("expected a channel-validation error, got:\n%s", out)
	}
}

// TestUpdateRejectsVersionFlags pins down the design decision that `update`
// only ever accepts a channel, never an exact version pin — cobra must
// reject the flag outright (it isn't registered on updateCmd at all), not
// silently ignore it.
func TestUpdateRejectsVersionFlags(t *testing.T) {
	bin := binary(t)
	for _, flag := range []string{"--sdk-version", "--platform-version"} {
		out, code := run(t, bin, "update", flag, "1.2.3", "--platform", t.TempDir())
		if code == 0 {
			t.Errorf("update %s should be rejected, got success:\n%s", flag, out)
		}
		if !strings.Contains(strings.ToLower(out), "unknown flag") {
			t.Errorf("update %s: expected 'unknown flag' error, got:\n%s", flag, out)
		}
	}
}

func TestInstallAcceptsAxisFlags(t *testing.T) {
	bin := binary(t)
	out, code := run(t, bin, "install", "--help")
	if code != 0 {
		t.Fatalf("install --help exited %d:\n%s", code, out)
	}
	for _, want := range []string{"--sdk-version", "--sdk-channel", "--platform-version", "--platform-channel", "--force-compat"} {
		if !strings.Contains(out, want) {
			t.Errorf("install --help missing %q", want)
		}
	}
}

// ── real installs (network required) ─────────────────────────────────────────

// installedVersion reads the "version" field of an installed package's
// package.json under platformDir/node_modules.
func installedVersion(t *testing.T, platformDir, pkg string) string {
	t.Helper()
	pkgPath := filepath.Join(platformDir, "node_modules", "@kb-labs", pkg, "package.json")
	// #nosec G304 -- path is constructed from t.TempDir().
	data, err := os.ReadFile(pkgPath)
	if err != nil {
		t.Fatalf("read %s: %v", pkgPath, err)
	}
	var parsed struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("parse %s: %v", pkgPath, err)
	}
	if parsed.Version == "" {
		t.Fatalf("%s has no version field", pkgPath)
	}
	return parsed.Version
}

// TestSDKVersionPin installs with an exact --sdk-version pin (a real,
// immutable, already-published version — pinning avoids any dependency on
// what "latest"/"canary" happen to point at when this test runs) and
// verifies: the pin resolves with zero registry lookups needed (no
// --sdk-channel involved), the pinned package actually lands on disk at
// that exact version, `status` reports it as "pinned", and doctor's new
// binary-symlink check passes for a normal install.
func TestSDKVersionPin(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	const pinnedSDK = "2.115.3" // published; see internal/manifest package-version history

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	out, code := run(t, bin, projectDir, "--yes", "--sdk-version", pinnedSDK, "--platform", platformDir)
	if code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}

	if got := installedVersion(t, platformDir, "sdk"); got != pinnedSDK {
		t.Errorf("installed @kb-labs/sdk version = %q, want the pinned %q", got, pinnedSDK)
	}

	t.Run("status shows the pinned version", func(t *testing.T) {
		out, code := run(t, bin, "status", "--platform", platformDir)
		if code != 0 {
			t.Fatalf("status exited %d:\n%s", code, out)
		}
		if !strings.Contains(out, "pinned "+pinnedSDK) {
			t.Errorf("status output missing %q:\n%s", "pinned "+pinnedSDK, out)
		}
	})

	t.Run("doctor binaries check passes", func(t *testing.T) {
		out, code := run(t, bin, "doctor", "--platform", platformDir)
		if code != 0 {
			t.Fatalf("doctor exited %d:\n%s", code, out)
		}
		if !strings.Contains(out, "binaries") {
			t.Errorf("doctor output missing the new 'binaries' check:\n%s", out)
		}
	})
}

// TestPlatformVersionPinKeepsCompanionAligned exercises the invariant behind
// the Platform axis with a real installation: an exact platform pin applies
// to both a service package and its independently-installed companion CLI
// package. The latter was the original mixed-channel regression.
func TestPlatformVersionPinKeepsCompanionAligned(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	// CI's Verdaccio only publishes the current checkout, while a developer's
	// public-registry run needs a released version. The workspace version is
	// valid in both cases for a release train checkout.
	pinnedPlatform := readPkgVersion(t, "core/runtime/package.json")
	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	out, code := run(t, bin, projectDir, "--yes", "--platform-version", pinnedPlatform, "--platform", platformDir)
	if code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}

	for _, pkg := range []string{"core-runtime", "workflow-daemon", "workflow-entry"} {
		if got := installedVersion(t, platformDir, pkg); got != pinnedPlatform {
			t.Errorf("installed @kb-labs/%s version = %q, want platform pin %q", pkg, got, pinnedPlatform)
		}
	}

	statusOut, code := run(t, bin, "status", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("status exited %d:\n%s", code, statusOut)
	}
	if !strings.Contains(statusOut, "pinned "+pinnedPlatform) {
		t.Errorf("status does not show pinned Platform version %q:\n%s", pinnedPlatform, statusOut)
	}
}

// TestPlatformChannelCanaryResolves installs with --platform-channel canary
// and verifies the channel actually reaches the package manager (a real,
// non-empty, non-literal-"canary" semver lands in node_modules — proving
// the dist-tag was resolved, not just echoed) and that status surfaces the
// channel. Deliberately does not assert a specific version number, since
// canary moves with every release and pinning the assertion to today's
// value would make this test flaky over time.
func TestPlatformChannelCanaryResolves(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	out, code := run(t, bin, projectDir, "--yes", "--platform-channel", "canary", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}

	version := installedVersion(t, platformDir, "core-runtime")
	if version == "canary" || version == "latest" {
		t.Fatalf("installed @kb-labs/core-runtime version = %q — a literal dist-tag leaked into node_modules instead of a resolved semver", version)
	}

	statusOut, code := run(t, bin, "status", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("status exited %d:\n%s", code, statusOut)
	}
	if !strings.Contains(statusOut, "canary") {
		t.Errorf("status does not report the canary platform channel:\n%s", statusOut)
	}
	if !strings.Contains(statusOut, version) {
		t.Errorf("status does not show the resolved version %q:\n%s", version, statusOut)
	}
}

// TestUpdateStickyChannel verifies that a bare `update` (no --platform-channel
// flag) keeps tracking whatever channel the last install/update selected,
// instead of silently reverting to stable — the whole point of persisting
// InstallSource.PlatformChannel.
func TestUpdateStickyChannel(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	if out, code := run(t, bin, projectDir, "--yes", "--platform-channel", "canary", "--platform", platformDir); code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}

	// Bare update — no --platform-channel flag at all.
	if out, code := run(t, bin, "update", "--yes", "--platform", platformDir); code != 0 {
		t.Fatalf("update exited %d:\n%s", code, out)
	}

	statusOut, code := run(t, bin, "status", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("status exited %d:\n%s", code, statusOut)
	}
	if !strings.Contains(statusOut, "canary") {
		t.Errorf("update without --platform-channel must keep tracking canary (sticky), got:\n%s", statusOut)
	}
}
