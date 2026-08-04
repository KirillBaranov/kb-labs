// End-to-end test for the multi-project registry / switch feature: one
// installed platform shared by several project directories via
// kb.config.jsonc's "platform.dir" pointer, with `kb-dev register` /
// `kb-dev switch` / `kb-dev projects` managing which project's services are
// actually running.
//
// This scenario is exactly what a manual live run against a real install
// caught two real bugs in (an over-eager "//" comment stripper that
// truncated "http://" URLs in the generated config, and missing
// trailing-comma handling) — bugs no unit test surfaced because they only
// show up against the real, fully-rendered kb.config.jsonc. This test exists
// so that class of regression fails CI instead of requiring another manual
// pass.
package e2e

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

// buildLocalKbDev builds kb-dev from this workspace's own tools/kb-dev
// source and overwrites dest with it.
//
// The installer drops a *released* kb-dev binary (downloaded from GitHub
// Releases via bindown — see internal/installer.installBinaries) into
// <platformDir>/bin/kb-dev. That's correct for testing the installer itself,
// but it means the binary under test has none of the local, not-yet-released
// changes to tools/kb-dev — exactly the register/switch/projects commands
// this test exists to exercise. Overwriting it with a local build is the
// same thing a kb-labs developer does by hand when dev-testing an unreleased
// kb-dev change against a real install.
func buildLocalKbDev(t *testing.T, dest string) {
	t.Helper()
	kbDevRoot := filepath.Join(testdataWd(t), "..", "kb-dev")
	cmd := exec.Command("go", "build", "-o", dest, ".") //nolint:gosec // go tool + fixed args
	cmd.Dir = kbDevRoot
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build local kb-dev from %s: %v\n%s", kbDevRoot, err, out)
	}
}

// writePointerConfig writes the minimal projectDir/.kb/kb.config.jsonc
// pointer a project needs to attach to an existing shared platform — the
// same shape kb-create's own scaffold.generatePointer produces, hand-written
// here to attach a second/third project without paying for another full
// (network, 20-30s) installer run against an already-installed platform.
func writePointerConfig(t *testing.T, projectDir, platformDir string) {
	t.Helper()
	dir := filepath.Join(projectDir, ".kb")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	content := `{
  "platform": { "dir": ` + strconv.Quote(platformDir) + ` },
  "projects": {
    // kb-dev:projects:start
    // kb-dev:projects:end
  }
}
`
	if err := os.WriteFile(filepath.Join(dir, "kb.config.jsonc"), []byte(content), 0o644); err != nil { //nolint:gosec // test fixture
		t.Fatalf("write pointer config: %v", err)
	}
}

// devservicesServiceIDs reads platformDir/.kb/devservices.yaml and returns
// its service IDs, so the test's "N services" expectations track whatever
// the manifest actually produces instead of a hardcoded count.
func devservicesServiceIDs(t *testing.T, platformDir string) []string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(platformDir, ".kb", "devservices.yaml")) // #nosec G304 -- path under t.TempDir()
	if err != nil {
		t.Fatalf("read devservices.yaml: %v", err)
	}
	var cfg struct {
		Services map[string]any `yaml:"services"`
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		t.Fatalf("parse devservices.yaml: %v", err)
	}
	ids := make([]string, 0, len(cfg.Services))
	for id := range cfg.Services {
		ids = append(ids, id)
	}
	return ids
}

// countLiveKBLabsProcesses shells out to `ps` and counts processes whose
// command line matches "./node_modules/@kb-labs/" — the shape of every
// command a generated devservices.yaml runs (e.g.
// "node ./node_modules/@kb-labs/gateway-app/dist/index.js", or
// "node ./node_modules/@kb-labs/studio-app/server.js" — note not every
// service has a "dist/" directory, so that can't be part of the pattern).
// Deliberately does NOT match plain "@kb-labs/" alone, which would also catch
// unrelated processes on a dev machine (e.g. "pnpm --filter @kb-labs/docs-site dev").
// Used as an independent check (outside kb-dev's own self-reported status)
// that `switch` actually released a project's processes rather than leaking
// them — the exact class of bug the state-namespacing fix addresses.
func countLiveKBLabsProcesses(t *testing.T) int {
	t.Helper()
	out, err := exec.Command("ps", "aux").Output() // #nosec G204 -- fixed args, no user input
	if err != nil {
		t.Fatalf("ps aux: %v", err)
	}
	count := 0
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "node_modules/@kb-labs/") {
			count++
		}
	}
	return count
}

// projectStatusJSON is the shape `kb-dev projects --json` emits
// (cmd/projects.go's projectStatus).
type projectStatusJSON struct {
	Alias   string `json:"alias"`
	Path    string `json:"path"`
	Running bool   `json:"running"`
	Error   string `json:"error,omitempty"`
}

func kbDevProjectsJSON(t *testing.T, kbDevPath, platformDir string, extraArgs ...string) []projectStatusJSON {
	t.Helper()
	args := append([]string{"projects", "--json", "--platform-dir", platformDir}, extraArgs...)
	// Run from an unrelated directory to prove `projects` (like `switch`)
	// works without depending on cwd being inside any project.
	stdout, stderr, code := runKbDevIn(t, kbDevPath, t.TempDir(), args...)
	if code != 0 {
		t.Fatalf("kb-dev projects --json exited %d\nstdout:\n%s\nstderr:\n%s", code, stdout, stderr)
	}
	var statuses []projectStatusJSON
	if err := json.Unmarshal([]byte(stdout), &statuses); err != nil {
		t.Fatalf("kb-dev projects --json produced invalid JSON: %v\nstdout:\n%s", err, stdout)
	}
	return statuses
}

// allServicesState returns the state of every service in a `kb-dev status
// --json` response, keyed by service ID.
func allServicesState(t *testing.T, status map[string]any) map[string]string {
	t.Helper()
	services, ok := status["services"].(map[string]any)
	if !ok {
		t.Fatalf("status --json missing services map: %v", status)
	}
	states := make(map[string]string, len(services))
	for id, raw := range services {
		svc, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		state, _ := svc["state"].(string)
		states[id] = state
	}
	return states
}

func servicePort(t *testing.T, status map[string]any, serviceID string) float64 {
	t.Helper()
	services, ok := status["services"].(map[string]any)
	if !ok {
		t.Fatalf("status --json missing services map: %v", status)
	}
	svc, ok := services[serviceID].(map[string]any)
	if !ok {
		t.Fatalf("status --json missing service %q: %v", serviceID, status)
	}
	port, _ := svc["port"].(float64)
	return port
}

// TestKbDevRegistrySwitch_MultiProjectSharedPlatform exercises the full
// register/projects/switch lifecycle against a real installed platform
// shared by three project directories — mirroring the target user scenario
// (many local project checkouts, one shared ~/kb-platform install).
func TestKbDevRegistrySwitch_MultiProjectSharedPlatform(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projA := t.TempDir()
	projB := t.TempDir()
	projC := t.TempDir()

	mustGit(t, projA, "init")
	mustGit(t, projA, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	if _, code := runInDir(t, bin, projA, "--yes", "--local", "--platform", platformDir); code != 0 {
		t.Fatalf("install failed")
	}

	// Attach two more projects to the same platform without re-running the
	// (slow, network) installer — see writePointerConfig's doc comment.
	writePointerConfig(t, projB, platformDir)
	writePointerConfig(t, projC, platformDir)

	kbDev := kbDevBinary(platformDir)
	buildLocalKbDev(t, kbDev) // see buildLocalKbDev's doc comment

	serviceIDs := devservicesServiceIDs(t, platformDir)
	if len(serviceIDs) == 0 {
		t.Fatal("devservices.yaml has no services — nothing to test")
	}

	// Belt-and-suspenders: whatever happens in the test body, make sure no
	// service is left running on the machine afterward.
	t.Cleanup(func() {
		_, _, _ = runKbDevIn(t, kbDev, t.TempDir(), "projects", "--prune", "--platform-dir", platformDir)
	})

	// 1. register — the realistic flow: cd into each project, register with
	// no explicit path/platform-dir, relying on config.Discover to find the
	// platform via that project's own kb.config.jsonc pointer.
	for alias, dir := range map[string]string{"a": projA, "b": projB, "c": projC} {
		stdout, stderr, code := runKbDevIn(t, kbDev, dir, "register", alias)
		if code != 0 {
			t.Fatalf("register %s failed: exit %d\nstdout:\n%s\nstderr:\n%s", alias, code, stdout, stderr)
		}
	}

	// 2. projects — invoked from neither project (proves it isn't
	// CWD-dependent), all three should show up, none running yet.
	statuses := kbDevProjectsJSON(t, kbDev, platformDir)
	if len(statuses) != 3 {
		t.Fatalf("expected 3 registered projects, got %d: %+v", len(statuses), statuses)
	}
	for _, st := range statuses {
		if st.Running {
			t.Errorf("project %q reported running before anything was started", st.Alias)
		}
	}

	// 3. switch a — invoked from an unrelated directory (proves `switch`
	// works from anywhere), must actually start every service.
	if stdout, stderr, code := runKbDevIn(t, kbDev, t.TempDir(), "switch", "a", "--platform-dir", platformDir); code != 0 {
		t.Fatalf("switch a failed: exit %d\nstdout:\n%s\nstderr:\n%s", code, stdout, stderr)
	}

	statusA, bad := waitAllAlive(t, kbDev, projA, 30*time.Second)
	if len(bad) != 0 {
		t.Fatalf("after switch a, services not alive after waiting: %v", bad)
	}

	liveAfterA := countLiveKBLabsProcesses(t)
	if liveAfterA != len(serviceIDs) {
		t.Fatalf("expected %d live @kb-labs processes after switch a, found %d", len(serviceIDs), liveAfterA)
	}

	// 4. switch b — a must be fully released (not just "forgotten") before b
	// starts; this is exactly the bug a shared, un-namespaced state dir would
	// reintroduce (project B's Reconcile reading project A's PID files, or
	// vice versa).
	if stdout, stderr, code := runKbDevIn(t, kbDev, t.TempDir(), "switch", "b", "--platform-dir", platformDir); code != 0 {
		t.Fatalf("switch b failed: exit %d\nstdout:\n%s\nstderr:\n%s", code, stdout, stderr)
	}

	statusAAfter, err := kbDevStatusJSONFrom(t, kbDev, projA)
	if err != nil {
		t.Fatalf("status from projA after switch b: %v", err)
	}
	for id, state := range allServicesState(t, statusAAfter) {
		if state == "alive" {
			t.Errorf("project a service %q still alive after switch b — switch did not release it", id)
		}
	}

	statusB, bad := waitAllAlive(t, kbDev, projB, 30*time.Second)
	if len(bad) != 0 {
		t.Fatalf("after switch b, services not alive after waiting: %v", bad)
	}

	// Ports must differ between a and b's runs — proves the per-alias
	// deterministic offset actually avoided a collision, not just that b
	// happened to reuse a's now-free ports by coincidence.
	if gatewayA, gatewayB := servicePort(t, statusA, "gateway"), servicePort(t, statusB, "gateway"); gatewayA == gatewayB {
		t.Errorf("gateway port identical between switch a (%v) and switch b (%v) — offsets did not differ", gatewayA, gatewayB)
	}

	// No process leak/duplication: still exactly one project's worth of
	// processes running, not accumulating across switches.
	liveAfterB := countLiveKBLabsProcesses(t)
	if liveAfterB != len(serviceIDs) {
		t.Fatalf("expected %d live @kb-labs processes after switch b, found %d (want no accumulation vs switch a's %d)",
			len(serviceIDs), liveAfterB, liveAfterA)
	}

	// projects --json should now agree: b alive, a and c not.
	statuses = kbDevProjectsJSON(t, kbDev, platformDir)
	running := map[string]bool{}
	for _, st := range statuses {
		running[st.Alias] = st.Running
	}
	if !running["b"] {
		t.Error(`projects reports "b" not running after switch b`)
	}
	if running["a"] {
		t.Error(`projects reports "a" still running after switch b`)
	}
	if running["c"] {
		t.Error(`projects reports "c" running — it was never switched to`)
	}

	// 5. prune — everything must actually stop.
	if stdout, stderr, code := runKbDevIn(t, kbDev, t.TempDir(), "projects", "--prune", "--platform-dir", platformDir); code != 0 {
		t.Fatalf("projects --prune failed: exit %d\nstdout:\n%s\nstderr:\n%s", code, stdout, stderr)
	}
	if live := countLiveKBLabsProcesses(t); live != 0 {
		t.Errorf("expected 0 live @kb-labs processes after --prune, found %d", live)
	}
}

// waitAllAlive polls `kb-dev status --json` from dir until every service is
// "alive" or timeout elapses. A service can legitimately take a moment past
// Start()'s own health-check wait to settle under CI resource pressure —
// tolerating that here matches the rest of this suite's stance (see
// TestServicesStartStop: "not that the service itself boots all the way up
// ... depends on runtime deps outside kb-create's scope"). Returns the last
// observed status and the states that weren't alive when it gave up, if any.
func waitAllAlive(t *testing.T, kbDevPath, dir string, timeout time.Duration) (map[string]any, map[string]string) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	var lastStatus map[string]any
	var lastBad map[string]string

	for {
		status, err := kbDevStatusJSONFrom(t, kbDevPath, dir)
		if err == nil {
			lastStatus = status
			bad := map[string]string{}
			for id, state := range allServicesState(t, status) {
				if state != "alive" {
					bad[id] = state
				}
			}
			lastBad = bad
			if len(bad) == 0 {
				return status, nil
			}
		}
		if time.Now().After(deadline) {
			return lastStatus, lastBad
		}
		time.Sleep(2 * time.Second)
	}
}

// kbDevStatusJSONFrom runs `kb-dev status --json` with cwd=dir (a registered
// project directory), exercising the real project-based discovery path
// (config.Discover walking up from cwd, following platform.dir) rather than
// an explicit --config/--platform-dir override.
func kbDevStatusJSONFrom(t *testing.T, kbDevPath, dir string) (map[string]any, error) {
	t.Helper()
	stdout, stderr, code := runKbDevIn(t, kbDevPath, dir, "status", "--json")
	if code != 0 && stdout == "" {
		return nil, fmt.Errorf("kb-dev status --json exited %d\nstderr:\n%s", code, stderr)
	}
	var parsed map[string]any
	if err := json.Unmarshal([]byte(stdout), &parsed); err != nil {
		return nil, fmt.Errorf("kb-dev status --json produced invalid JSON: %w\nstdout:\n%s", err, stdout)
	}
	return parsed, nil
}
