// Journey tests for the "install via CI" path: `kb-create install
// --plugins/--services/--adapters`, the exact invocation
// .github/actions/kb-create-install/action.yml's "Install" step shells out
// to (see its `runs.steps[2].run`). TestInstallScopedPlugin in
// install_scoped_test.go already covers a single unpinned plugin with no
// services/adapters; these tests cover what a real CI caller actually needs:
// a version pin (#298), multiple plugins + a service together, an adapter
// override (#296), and the adapter-role reconciliation report that feature
// added — none of which had an e2e test chaining them the way a caller
// really uses them.

package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestCIInstallJourney_PinnedPluginsServicesAndAdapters mirrors a realistic
// CI caller: pin one plugin to an exact version, install a second plugin
// unpinned alongside a service, and pass an --adapters override — the same
// shape as the composite action's `plugins`/`services`/`adapters` inputs.
func TestCIInstallJourney_PinnedPluginsServicesAndAdapters(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	// Pin to whatever version this checkout will actually publish — a
	// hardcoded version number would be wrong the moment the monorepo bumps,
	// and in CI the local Verdaccio instance only ever has this one version
	// anyway (see e2e/scripts/pack-all.sh).
	pinnedVersion := readPkgVersion(t, filepath.Join("plugins", "release", "manager-cli", "package.json"))

	out, code := run(t, bin, "install",
		"--plugins", "release@"+pinnedVersion+",commit",
		"--services", "workflow",
		"--adapters", "cache=@kb-labs/adapters-redis,bogus-role=@kb-labs/data-store",
		"--platform", platformDir,
	)
	if code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, "Installed") {
		t.Errorf("install output missing success line:\n%s", out)
	}

	nm := filepath.Join(platformDir, "node_modules", "@kb-labs")

	// The pinned plugin resolved to exactly the requested version, not
	// whatever "latest" happens to be.
	releasePkg := filepath.Join(nm, "release-manager-cli", "package.json")
	data, err := os.ReadFile(releasePkg) // #nosec G304 -- path constructed from t.TempDir()
	if err != nil {
		t.Fatalf("release-manager-cli not installed: %v", err)
	}
	var pkg struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		t.Fatalf("release-manager-cli package.json invalid JSON: %v", err)
	}
	if pkg.Version != pinnedVersion {
		t.Errorf("release-manager-cli version = %q, want pinned %q", pkg.Version, pinnedVersion)
	}

	// The unpinned plugin and the selected service both installed too.
	if _, err := os.Stat(filepath.Join(nm, "commit-entry")); err != nil {
		t.Errorf("commit-entry not installed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(nm, "workflow-daemon")); err != nil {
		t.Errorf("workflow-daemon not installed despite --services=workflow: %v", err)
	}

	// Unselected services must not leak in — same scoping invariant
	// TestInstallScopedPlugin checks for a single-plugin install.
	for _, unwanted := range []string{"gateway-app", "marketplace-app", "rest-api-app", "studio-app"} {
		if _, err := os.Stat(filepath.Join(nm, unwanted)); err == nil {
			t.Errorf("%s was installed but --services only named workflow — install is not scoped", unwanted)
		}
	}

	// `release` declares platform.requires = ["storage", "cache"] (see
	// plugins/release/manager-cli/src/manifest.ts). storage has a default
	// adapter; cache does not, so --adapters="cache=..." must satisfy the
	// reconciliation check and produce no "unconfigured" warning for it.
	if strings.Contains(out, `requires capability "cache" but no adapter is configured`) {
		t.Errorf("cache adapter was configured via --adapters but reconciliation still warned:\n%s", out)
	}

	// "bogus-role" isn't a real capability (see
	// core/plugin-runtime/src/platform/adapter-registry.ts) — the
	// reconciliation report must flag it as unrecognized rather than
	// silently accepting it.
	if !strings.Contains(out, `"bogus-role" is not a recognized capability role`) {
		t.Errorf("unrecognized adapter role %q was not flagged:\n%s", "bogus-role", out)
	}

	// kb.config.jsonc must reflect both installed plugins and the service.
	cfg, err := os.ReadFile(filepath.Join(platformDir, ".kb", "kb.config.jsonc")) // #nosec G304
	if err != nil {
		t.Fatalf("kb.config.jsonc not found: %v", err)
	}
	for _, want := range []string{`"release": {`, `"commit": {`} {
		if !strings.Contains(string(cfg), want) {
			t.Errorf("kb.config.jsonc missing %s block:\n%s", want, cfg)
		}
	}
}

// TestCIInstallJourney_UnconfiguredRequiredCapabilityWarns is the negative
// case for the reconciliation report: install `release` (requires "cache")
// with NO --adapters override at all, and confirm the install still
// succeeds (reconciliation is informational, never fatal — see
// printAdapterReconciliation's doc comment) while loudly warning about the
// missing capability. Without this, the reconciliation feature could regress
// to "always silent" or "always fails the install" without any test noticing.
func TestCIInstallJourney_UnconfiguredRequiredCapabilityWarns(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	out, code := run(t, bin, "install",
		"--plugins", "release",
		"--platform", platformDir,
	)
	if code != 0 {
		t.Fatalf("install --plugins=release (no --adapters) exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, `requires capability "cache" but no adapter is configured`) {
		t.Errorf("expected a loud warning about the unconfigured 'cache' capability:\n%s", out)
	}
	// "storage" has a manifest-wide default adapter (see
	// internal/manifest/manifest.json's adapterConfig), so it must NOT warn.
	if strings.Contains(out, `requires capability "storage" but no adapter is configured`) {
		t.Errorf("storage has a default adapter and should not be flagged as unconfigured:\n%s", out)
	}
}

// TestCIInstallJourney_ExecutesInstalledPlugin continues the CI install past
// package resolution. A green install is not useful if the installed CLI
// cannot actually dispatch one of the requested plugins from the checked-out
// project directory.
func TestCIInstallJourney_ExecutesInstalledPlugin(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	out, code := runInDir(t, bin, projectDir,
		"install",
		"--plugins", "scaffold",
		"--platform", platformDir,
	)
	if code != 0 {
		t.Fatalf("CI install exited %d:\n%s", code, out)
	}
	// A clean checkout has no scan root until the project creates its plugin
	// workspace. Keep the CI journey realistic while giving the installed
	// plugin a valid, empty root to inspect.
	if err := os.MkdirAll(filepath.Join(projectDir, ".kb", "plugins"), 0o750); err != nil {
		t.Fatalf("create clean plugin workspace: %v", err)
	}

	// This is a real plugin command from the installed platform, invoked from
	// the project checkout exactly as a CI step would invoke it.
	out, code = runKb(t, platformDir, projectDir, "scaffold", "doctor")
	if code != 0 {
		t.Fatalf("installed scaffold plugin exited %d:\n%s", code, out)
	}
	if !strings.Contains(strings.ToLower(out), "no issues found") {
		t.Errorf("installed plugin did not produce its user-facing result:\n%s", out)
	}
}
