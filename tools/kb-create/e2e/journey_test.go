// Automates the manual steps from docs/qa/scenarios/PC-001-clean-install.md
// and docs/qa/scenarios/S-001-solo-install-first-run.md that aren't already
// covered by TestInstallYes and friends in e2e_test.go: two projects sharing
// one platform dir staying isolated (PC-001 Phase 4), and generated configs
// never containing placeholder values (PC-001 step 9's pass criterion).
//
// Network-heavy — skipped under -short, same convention as e2e_test.go.
package e2e

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestTwoProjectsShareOnePlatformIsolated automates PC-001 Phase 4
// (steps 15-17): a second project created against the SAME platform dir
// must succeed without touching the first project, and each project's own
// .kb/ config must stay independent (no cross-contamination of pointers).
func TestTwoProjectsShareOnePlatformIsolated(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	firstProject := t.TempDir()
	mustGit(t, firstProject, "init")
	mustGit(t, firstProject, "commit", "--allow-empty", "-m", "init")

	if out, code := run(t, bin, firstProject, "--yes", "--platform", platformDir); code != 0 {
		t.Fatalf("first project install exited %d:\n%s", code, out)
	}

	firstMarker := filepath.Join(firstProject, ".kb", "kb.config.jsonc")
	firstBefore, err := os.ReadFile(firstMarker) // #nosec G304 -- path under t.TempDir()
	if err != nil {
		t.Fatalf("first project config not written: %v", err)
	}

	secondProject := t.TempDir()
	mustGit(t, secondProject, "init")
	mustGit(t, secondProject, "commit", "--allow-empty", "-m", "init")

	// Second project reuses the SAME platform dir — this is the "isolation"
	// case: it must succeed and must not need a second full package install.
	out, code := run(t, bin, secondProject, "--yes", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("second project install (shared platform) exited %d:\n%s", code, out)
	}

	// The first project's config must be byte-for-byte untouched.
	firstAfter, err := os.ReadFile(firstMarker) // #nosec G304
	if err != nil {
		t.Fatalf("first project config disappeared after second install: %v", err)
	}
	if string(firstBefore) != string(firstAfter) {
		t.Errorf("first project's kb.config.jsonc changed after installing a second project:\nbefore:\n%s\nafter:\n%s",
			firstBefore, firstAfter)
	}

	// The second project must have gotten its OWN pointer config, pointing at
	// the same platform dir but not equal to the first project's file content
	// verbatim by coincidence of both being under the same platform (they
	// live at different paths, so at minimum the CWD they were generated for
	// differs — assert both exist independently rather than comparing bytes).
	secondMarker := filepath.Join(secondProject, ".kb", "kb.config.jsonc")
	secondCfg, err := os.ReadFile(secondMarker) // #nosec G304
	if err != nil {
		t.Fatalf("second project config not written: %v", err)
	}
	if !strings.Contains(string(secondCfg), platformDir) {
		t.Errorf("second project's kb.config.jsonc does not point at shared platform dir %q:\n%s", platformDir, secondCfg)
	}

	// `kb-create status` from the shared platform must still work after both
	// installs — proves the platform dir wasn't left in a half-written state
	// by the second (package-reuse) install.
	if out, code := run(t, bin, "status", "--platform", platformDir); code != 0 {
		t.Errorf("status after two-project shared-platform install exited %d:\n%s", code, out)
	}
}

// TestNoPlaceholderValuesInGeneratedConfigs pins PC-001's pass criterion
// ("no placeholder values like \"YOUR_KEY\"") as an assertion instead of a
// human eyeballing the config after install.
func TestNoPlaceholderValuesInGeneratedConfigs(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	if out, code := run(t, bin, projectDir, "--yes", "--platform", platformDir); code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}

	placeholders := []string{
		"YOUR_KEY", "YOUR_API_KEY", "CHANGEME", "REPLACE_ME", "TODO_", "<PLACEHOLDER>", "xxx-your-key-xxx",
	}
	configs := []string{
		filepath.Join(platformDir, ".kb", "kb.config.jsonc"),
		filepath.Join(projectDir, ".kb", "kb.config.jsonc"),
		filepath.Join(platformDir, ".kb", "marketplace.lock"),
		filepath.Join(platformDir, ".kb", "devservices.yaml"),
	}
	for _, path := range configs {
		data, err := os.ReadFile(path) // #nosec G304 -- paths built from t.TempDir()
		if err != nil {
			t.Errorf("expected config at %s: %v", path, err)
			continue
		}
		content := string(data)
		for _, ph := range placeholders {
			if strings.Contains(content, ph) {
				t.Errorf("%s contains placeholder value %q — install must never emit unfilled placeholders", path, ph)
			}
		}
	}
}
