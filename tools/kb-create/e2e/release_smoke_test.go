// Release-candidate smoke is intentionally a single, isolated user journey.
// It is the promotion gate: broad lifecycle coverage belongs to the sharded
// e2e suite, while this test answers one question against real npm canaries:
// can a new user install the platform and invoke its two required CLIs?
package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReleaseCandidateJourney(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	// The installer writes wrappers below HOME. A release gate must not rely on
	// or mutate the runner's shared user state, otherwise retries observe a
	// previous attempt instead of the candidate under test.
	t.Setenv("HOME", t.TempDir())

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "release-smoke")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	out, code := run(t, bin, projectDir, "--yes", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}
	for _, want := range []string{"KB Labs installed successfully", "Next steps:"} {
		if !strings.Contains(out, want) {
			t.Fatalf("install output missing %q:\n%s", want, out)
		}
	}

	for _, required := range []string{
		filepath.Join(platformDir, ".kb", "install.json"),
		filepath.Join(platformDir, ".kb", "kb.config.jsonc"),
		filepath.Join(platformDir, ".kb", "marketplace.lock"),
		filepath.Join(platformDir, "node_modules", "@kb-labs", "cli-bin", "dist", "bin.js"),
		kbDevBinary(platformDir),
	} {
		if _, err := os.Stat(required); err != nil {
			t.Fatalf("required installed artifact %s is missing: %v", required, err)
		}
	}

	// `kb` dispatch from the generated project proves both package installation
	// and platform/project discovery. `kb-dev status` proves that the released
	// binary can parse the same generated configuration without needing a full
	// infrastructure boot in the promotion-critical path.
	kbOut, kbCode := runKb(t, platformDir, projectDir, "--help")
	if kbCode != 0 || !strings.Contains(kbOut, "KB Labs") {
		t.Fatalf("installed kb --help exited %d:\n%s", kbCode, kbOut)
	}
	status, err := kbDevStatusJSON(t, platformDir)
	if err != nil {
		t.Fatalf("installed kb-dev cannot read generated config: %v", err)
	}
	services, ok := status["services"].(map[string]any)
	if !ok || len(services) == 0 {
		t.Fatalf("kb-dev status has no generated services: %#v", status)
	}
}
