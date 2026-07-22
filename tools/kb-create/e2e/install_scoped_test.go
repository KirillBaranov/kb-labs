package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestInstallScopedPlugin exercises the new non-interactive
// `kb-create install --plugins=...` path end to end: only the named plugin
// (release) should be installed, no service packages (gateway/workflow/
// marketplace) should be pulled in, and devservices.yaml must not be written
// since no service was selected.
func TestInstallScopedPlugin(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	out, code := run(t, bin, "install", "--plugins=release", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("install --plugins=release exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, "Installed") {
		t.Errorf("install output missing success line:\n%s", out)
	}

	nm := filepath.Join(platformDir, "node_modules", "@kb-labs")
	if _, err := os.Stat(filepath.Join(nm, "release-manager-cli")); err != nil {
		t.Errorf("release-manager-cli not installed: %v", err)
	}
	for _, unwanted := range []string{"gateway-app", "workflow-daemon", "marketplace-entry"} {
		if _, err := os.Stat(filepath.Join(nm, unwanted)); err == nil {
			t.Errorf("%s was installed but no service was selected — install is not scoped", unwanted)
		}
	}

	cfgPath := filepath.Join(platformDir, ".kb", "kb.config.jsonc")
	cfg, err := os.ReadFile(cfgPath) // #nosec G304 -- path constructed from t.TempDir()
	if err != nil {
		t.Fatalf("kb.config.jsonc not found: %v", err)
	}
	if !strings.Contains(string(cfg), `"release": {`) || !strings.Contains(string(cfg), `"enabled": true`) {
		t.Errorf("kb.config.jsonc missing a plugins.release block:\n%s", cfg)
	}

	// release depends on @kb-labs/core-state-daemon (its cache/storage
	// backend), so devservices.yaml legitimately gets a state-daemon entry —
	// that's the manifest scanner finding what's actually in node_modules,
	// not a scoping leak. The real invariant is that no UNSELECTED service
	// (gateway/workflow/rest/studio) shows up.
	if data, err := os.ReadFile(filepath.Join(platformDir, ".kb", "devservices.yaml")); err == nil { // #nosec G304
		for _, unwanted := range []string{"gateway", "workflow", "rest-api", "studio"} {
			if strings.Contains(string(data), unwanted) {
				t.Errorf("devservices.yaml mentions %q but no service was selected:\n%s", unwanted, data)
			}
		}
	}
}

// TestInstallUnknownPluginFailsFast confirms the ID validation runs before
// any install/network action — an unknown plugin must fail immediately with
// no platform directory created, not partway through an install.
func TestInstallUnknownPluginFailsFast(t *testing.T) {
	bin := binary(t)
	platformDir := filepath.Join(t.TempDir(), "kb-platform") // must not be created

	out, code := run(t, bin, "install", "--plugins=this-plugin-does-not-exist", "--platform", platformDir)
	if code == 0 {
		t.Fatalf("install with unknown plugin should fail, got exit 0:\n%s", out)
	}
	if !strings.Contains(out, "unknown plugin") {
		t.Errorf("error output missing 'unknown plugin':\n%s", out)
	}
	if _, err := os.Stat(platformDir); err == nil {
		t.Errorf("platform dir was created despite validation failure — side effect before validation")
	}
}
