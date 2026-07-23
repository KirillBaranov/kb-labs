// TestSoloDeveloperJourney exercises the local-dev critical path end to end:
// install -> scaffold a plugin -> build it -> run every command it ships ->
// scaffold doctor reports it clean. This is Phase 5 of
// docs/qa/scenarios/S-001-solo-install-first-run.md ("Plugin scaffold &
// run"), which prior QA runs only ever exercised manually — no e2e test
// chained scaffold->build->run after a real kb-create install, and this
// exact path is where bug B-013 (generated manifest missing `segments`,
// command unreachable) was originally found. TestDemoReview*/TestDemoHint*
// in e2e_test.go cover a different feature (the wizard's own --demo review
// flag), not scaffold at all.

package e2e

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSoloDeveloperJourney(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	// Phase 1-3 (install & verify) are already covered by TestInstallYes and
	// friends — bootstrap only, no re-assertion of the install banner here.
	out, code := run(t, bin, projectDir, "--yes", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}

	// Phase 5, step 15: scaffold a plugin — "scaffold" ships enabled by
	// default, so `kb scaffold run` must already be reachable right after a
	// bare `--yes` install.
	out, code = runKb(t, platformDir, projectDir, "scaffold", "run", "plugin", "demo", "--yes")
	if code != 0 {
		t.Fatalf("kb scaffold run plugin demo exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, `Scaffolded plugin "demo"`) {
		t.Errorf("scaffold output missing success line:\n%s", out)
	}
	if !strings.Contains(out, "Registered in .kb/marketplace.lock") {
		t.Errorf("scaffold did not auto-register the plugin in marketplace.lock:\n%s", out)
	}

	entryDir := filepath.Join(projectDir, ".kb", "plugins", "demo", "packages", "demo-entry")
	if _, err := os.Stat(filepath.Join(entryDir, "package.json")); err != nil {
		t.Fatalf("scaffolded entry package.json missing: %v", err)
	}

	lockPath := filepath.Join(projectDir, ".kb", "marketplace.lock")
	lockData, err := os.ReadFile(lockPath) // #nosec G304 -- path constructed from t.TempDir()
	if err != nil {
		t.Fatalf("marketplace.lock not found: %v", err)
	}
	var lock struct {
		Installed map[string]struct {
			Enabled bool `json:"enabled"`
		} `json:"installed"`
	}
	if err := json.Unmarshal(lockData, &lock); err != nil {
		t.Fatalf("marketplace.lock invalid JSON: %v\n%s", err, lockData)
	}
	// entity.yaml's "scope" variable defaults to "@kb-labs" and
	// linkWithMarketplace derives the lock key from the entry package's own
	// name (stripping "-entry"), so the key is scope-qualified: "@kb-labs/demo",
	// not the bare scaffold name "demo".
	if entry, ok := lock.Installed["@kb-labs/demo"]; !ok || !entry.Enabled {
		t.Errorf("marketplace.lock has no enabled '@kb-labs/demo' entry:\n%s", lockData)
	}

	// Phase 5, step 16: build it — "pnpm install && pnpm build" in the
	// scaffolded plugin dir, exactly as the scaffold command's own "Next
	// steps" hint tells the user to.
	pluginRoot := filepath.Join(projectDir, ".kb", "plugins", "demo")
	if out, code := runPM(t, pluginRoot, "install"); code != 0 {
		t.Fatalf("pnpm install (scaffolded plugin) exited %d:\n%s", code, out)
	}
	if out, code := runPM(t, pluginRoot, "run", "build"); code != 0 {
		t.Fatalf("pnpm run build (scaffolded plugin) exited %d:\n%s", code, out)
	}

	manifestJS := filepath.Join(entryDir, "dist", "manifest.js")
	if _, err := os.Stat(manifestJS); err != nil {
		t.Fatalf("built plugin missing dist/manifest.js: %v", err)
	}

	// Phase 5, step 18 (this is exactly where B-013 broke): run the base
	// block's `hello` command and the cli block's `ping` command, in both
	// text and --json form.
	out, code = runKb(t, platformDir, projectDir, "demo", "hello", "--who=World")
	if code != 0 {
		t.Fatalf("kb demo hello exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, "Hello, World from demo!") {
		t.Errorf("kb demo hello did not print the expected greeting:\n%s", out)
	}

	out, code = runKb(t, platformDir, projectDir, "demo", "hello", "--json")
	if code != 0 {
		t.Fatalf("kb demo hello --json exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, `"greeting":"Hello, World from demo!"`) {
		t.Errorf("kb demo hello --json missing expected greeting field:\n%s", out)
	}

	out, code = runKb(t, platformDir, projectDir, "demo", "ping")
	if code != 0 {
		t.Fatalf("kb demo ping exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, "pong") {
		t.Errorf("kb demo ping did not respond:\n%s", out)
	}

	out, code = runKb(t, platformDir, projectDir, "demo", "ping", "--json")
	if code != 0 {
		t.Fatalf("kb demo ping --json exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, `"ok":true`) {
		t.Errorf(`kb demo ping --json missing "ok":true:%s`, out)
	}

	// scaffold doctor must find zero issues in a freshly generated, built
	// plugin — a non-zero finding here means the template itself regressed.
	out, code = runKb(t, platformDir, projectDir, "scaffold", "doctor")
	if code != 0 {
		t.Errorf("scaffold doctor exited %d on a fresh plugin (should be clean):\n%s", code, out)
	}
	if !strings.Contains(out, "no issues found") {
		t.Errorf("scaffold doctor did not report a clean scan:\n%s", out)
	}
}
