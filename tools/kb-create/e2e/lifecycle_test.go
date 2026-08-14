// End-to-end lifecycle test for the ADR-0014 release/swap/rollback flow.
//
// Exercises the kb-create binary as a subprocess with a stubbed pnpm on PATH
// so the test runs offline and completes in under a second once the binary is
// built. Complements the existing e2e/e2e_test.go network-heavy tests
// (skipped under -short) with a fast, hermetic lifecycle check.
package e2e

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// setup builds kb-create and wires a fake pnpm in PATH. Returns:
//   - platformDir under a t.TempDir()
//   - path to the built kb-create binary
//   - env slice suitable for os/exec.Cmd.Env
func setup(t *testing.T) (platformDir, kbCreate string, env []string) {
	t.Helper()

	root := t.TempDir()
	platformDir = filepath.Join(root, "platform")
	if err := os.MkdirAll(platformDir, 0o750); err != nil {
		t.Fatalf("mkdir platform: %v", err)
	}

	// Build kb-create from source (cwd = module root which is the parent of e2e/).
	kbCreate = filepath.Join(root, "kb-create")
	cmd := exec.Command("go", "build", "-o", kbCreate, ".") //nolint:gosec // go tool + fixed args
	cmd.Dir = testdataWd(t)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build kb-create: %v\n%s", err, out)
	}

	// Write a fake pnpm that creates node_modules/<pkg> for every arg after "add".
	fakeBin := filepath.Join(root, "bin")
	if err := os.MkdirAll(fakeBin, 0o755); err != nil {
		t.Fatalf("mkdir fake bin: %v", err)
	}
	pnpm := filepath.Join(fakeBin, "pnpm")
	//nolint:lll // fake pnpm script is intentionally terse
	script := `#!/usr/bin/env bash
set -e
if [ "${1:-}" = "list" ]; then
  printf '[{"dependencies":{'
  first=1
  for pkg in node_modules/@kb-labs/*; do
    [ -d "$pkg" ] || continue
    if [ "$first" = "0" ]; then printf ','; fi
    first=0
    printf '"@kb-labs/%s":{"version":"stub"}' "$(basename "$pkg")"
  done
  printf '}}]\n'
  exit 0
fi
# We only need to emulate "add --dir <dir> <specs...>" with --registry/--platform flags ignored.
dir=""
declare -a specs=()
skip_next=0
for arg in "$@"; do
  if [ "$skip_next" = "1" ]; then skip_next=0; continue; fi
  case "$arg" in
    add|install) continue;;
    --dir) skip_next=1; continue;;
    --registry) skip_next=1; continue;;
    --platform) skip_next=1; continue;;
    --prod) continue;;
  esac
  # Bare --dir=<dir> form not used by kb-create but safe to detect.
  if [[ "$arg" == --dir=* ]]; then dir="${arg#--dir=}"; continue; fi
  specs+=("$arg")
done
# The wrapper calls: pnpm add --dir <dir> <specs...>
# --dir is the first arg after "add", captured above via skip_next.
# We instead peek at every positional after flags — pnpm's wrapper in kb-create
# sets cmd.Dir = dir, so cwd is the destination.
mkdir -p node_modules
for spec in "${specs[@]}"; do
  # Strip @version suffix if any (except the scope @).
  pkg="$spec"
  # Find last '@' not at position 0.
  i=${#pkg}
  while [ $i -gt 1 ]; do
    i=$((i - 1))
    if [ "${pkg:$i:1}" = "@" ]; then pkg="${pkg:0:$i}"; break; fi
  done
  mkdir -p "node_modules/$pkg/dist"
  echo "{\"name\":\"$pkg\",\"version\":\"stub\"}" > "node_modules/$pkg/package.json"
done
exit 0
`
	if err := os.WriteFile(pnpm, []byte(script), 0o755); err != nil { //nolint:gosec // test fixture
		t.Fatalf("write fake pnpm: %v", err)
	}

	// Model the supported runtime explicitly. The host running tests may be an
	// older Node release, but these lifecycle tests are about installer behavior
	// after toolchain preflight, not about the host machine's version.
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Fatalf("locate node for lifecycle harness: %v", err)
	}
	nodeShim := filepath.Join(fakeBin, "node")
	nodeScript := fmt.Sprintf("#!/usr/bin/env bash\nif [ \"$1\" = \"--version\" ]; then echo v24.0.0; else exec %q \"$@\"; fi\n", nodePath)
	if err := os.WriteFile(nodeShim, []byte(nodeScript), 0o755); err != nil { //nolint:gosec // test fixture
		t.Fatalf("write fake node: %v", err)
	}
	// Fake PATH: supported Node/pnpm shims and basic shell tools.
	env = append(os.Environ(), "PATH="+fakeBin+":"+filepath.Dir(nodePath)+":/usr/bin:/bin")
	return platformDir, kbCreate, env
}

// testdataWd returns the absolute path of the kb-create module root (parent of e2e/).
func testdataWd(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	return filepath.Dir(wd)
}

// runKbCreate runs kb-create with the given args, returns stdout+stderr.
func runKbCreate(t *testing.T, bin string, env []string, args ...string) (string, error) {
	t.Helper()
	cmd := exec.Command(bin, args...)
	cmd.Env = env
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	err := cmd.Run()
	return buf.String(), err
}

// TestLifecycle_InstallSwapRollback exercises the full kb-create lifecycle
// against a temp platform dir and a stubbed pnpm.
func TestLifecycle_InstallSwapRollback(t *testing.T) {
	platformDir, kb, env := setup(t)

	// 1. First install: should create releases/gateway-1.0.0-<hash>/ and populate release.json.
	out, err := runKbCreate(t, kb, env,
		"install-service", "@kb-labs/gateway@1.0.0",
		"--adapters", "llm=@kb-labs/adapters-openai@0.4.1,cache=@kb-labs/adapters-redis@0.2.0",
		"--platform", platformDir,
	)
	if err != nil {
		t.Fatalf("install-service: %v\n%s", err, out)
	}
	if !strings.Contains(out, "installed release gateway-1.0.0-") {
		t.Fatalf("unexpected install output: %s", out)
	}

	// Extract release id from output for later.
	rel1 := extractReleaseID(t, out)
	releaseDir := filepath.Join(platformDir, "releases", rel1)
	mustExist(t, filepath.Join(releaseDir, "node_modules", "@kb-labs", "gateway"))
	mustExist(t, filepath.Join(releaseDir, "release.json"))
	mustExist(t, filepath.Join(platformDir, "releases.json"))

	// 2. Repeat install — must be idempotent no-op.
	out, err = runKbCreate(t, kb, env,
		"install-service", "@kb-labs/gateway@1.0.0",
		"--adapters", "llm=@kb-labs/adapters-openai@0.4.1,cache=@kb-labs/adapters-redis@0.2.0",
		"--platform", platformDir,
	)
	if err != nil {
		t.Fatalf("repeat install-service: %v\n%s", err, out)
	}
	if !strings.Contains(out, "already installed") {
		t.Fatalf("expected no-op output, got:\n%s", out)
	}

	// 3. Swap current → rel1.
	out, err = runKbCreate(t, kb, env,
		"swap", "@kb-labs/gateway", rel1,
		"--platform", platformDir,
	)
	if err != nil {
		t.Fatalf("swap: %v\n%s", err, out)
	}
	currentSymlink := filepath.Join(platformDir, "services", "gateway", "current")
	assertSymlinkEndsWith(t, currentSymlink, rel1)

	// 4. Install a second version, swap to it, verify previous points at rel1.
	out, err = runKbCreate(t, kb, env,
		"install-service", "@kb-labs/gateway@1.1.0",
		"--adapters", "llm=@kb-labs/adapters-openai@0.4.1,cache=@kb-labs/adapters-redis@0.2.0",
		"--platform", platformDir,
	)
	if err != nil {
		t.Fatalf("install 1.1.0: %v\n%s", err, out)
	}
	rel2 := extractReleaseID(t, out)
	if rel2 == rel1 {
		t.Fatalf("expected different release id, got %q twice", rel1)
	}
	if _, err := runKbCreate(t, kb, env, "swap", "@kb-labs/gateway", rel2, "--platform", platformDir); err != nil {
		t.Fatalf("swap to rel2: %v", err)
	}
	assertSymlinkEndsWith(t, currentSymlink, rel2)
	assertSymlinkEndsWith(t, filepath.Join(platformDir, "services", "gateway", "previous"), rel1)

	// 5. Rollback — current should go back to rel1.
	if _, err := runKbCreate(t, kb, env, "rollback", "@kb-labs/gateway", "--platform", platformDir); err != nil {
		t.Fatalf("rollback: %v", err)
	}
	assertSymlinkEndsWith(t, currentSymlink, rel1)

	// 6. releases --json — must list both, mark current=rel1.
	out, err = runKbCreate(t, kb, env, "releases", "--json", "--platform", platformDir)
	if err != nil {
		t.Fatalf("releases: %v\n%s", err, out)
	}
	var rep struct {
		Current  map[string]string `json:"current"`
		Releases map[string][]struct {
			ID string `json:"id"`
		} `json:"releases"`
	}
	// The 'releases' command prints its JSON as-is; no extra prefix lines.
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &rep); err != nil {
		t.Fatalf("parse releases JSON: %v\noutput:\n%s", err, out)
	}
	if rep.Current["@kb-labs/gateway"] != rel1 {
		t.Fatalf("current should be rel1, got %v", rep.Current)
	}
	if len(rep.Releases["@kb-labs/gateway"]) != 2 {
		t.Fatalf("expected 2 releases, got %v", rep.Releases)
	}
}

// TestPlatformDirMkdirFailsHardAbort exercises the hard-fail branch in
// installation-flow.md ("J1: Abort: create platform dir error"). `--platform`
// pointing under a read-only directory makes os.MkdirAll fail before any
// package manager work starts (create.go's MkdirAll call runs before
// Installer.Install) — no fake pnpm is needed, this fails earlier than that.
func TestPlatformDirMkdirFailsHardAbort(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("running as root — permission bits don't restrict root, can't force mkdir to fail")
	}

	root := t.TempDir()
	_, kbCreate, env := setup(t)

	readOnlyParent := filepath.Join(root, "readonly-parent")
	if err := os.MkdirAll(readOnlyParent, 0o755); err != nil {
		t.Fatalf("mkdir readOnlyParent: %v", err)
	}
	if err := os.Chmod(readOnlyParent, 0o500); err != nil {
		t.Fatalf("chmod readOnlyParent: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(readOnlyParent, 0o755) }) // let TempDir cleanup succeed

	platformDir := filepath.Join(readOnlyParent, "platform") // does not exist — MkdirAll must create it
	projectDir := t.TempDir()

	out, err := runKbCreate(t, kbCreate, env, projectDir, "--yes", "--platform", platformDir)
	if err == nil {
		t.Fatalf("expected kb-create to fail against a read-only platform parent, got success:\n%s", out)
	}
	if !strings.Contains(out, "ERR_INSTALL_WRITE") || !strings.Contains(out, "permission denied") || !strings.Contains(out, "check disk space and permissions") {
		t.Errorf("expected actionable platform permission diagnostic, got:\n%s", out)
	}
	if _, statErr := os.Stat(platformDir); statErr == nil {
		t.Errorf("platform dir %s was created despite the read-only parent", platformDir)
	}
}

// TestUninstallRetryThenHardFail exercises the "I: retry x3 with backoff"
// then "J1: Hard failure: platform dir left behind" branch in
// installation-flow.md's uninstall diagram (cmd/uninstall.go's `for attempt
// := range 3 { os.RemoveAll... }` loop). A subdirectory with its write bit
// removed makes os.RemoveAll(platformDir) fail deterministically on every
// attempt, without needing to reproduce the real macOS ENOTEMPTY race.
func TestUninstallRetryThenHardFail(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("running as root — permission bits don't restrict root, can't force RemoveAll to fail")
	}

	platformDir, kb, env := setup(t)
	projectDir := t.TempDir()

	// Fresh install using the stubbed-pnpm harness from setup().
	out, err := runKbCreate(t, kb, env, projectDir, "--yes", "--platform", platformDir)
	if err != nil {
		t.Fatalf("install: %v\n%s", err, out)
	}

	// Strip the write bit from node_modules so os.RemoveAll can't unlink its
	// entries — this is what makes the platform dir "stuck" the way a real
	// permission/ENOTEMPTY failure would.
	nodeModules := filepath.Join(platformDir, "node_modules")
	if err := os.Chmod(nodeModules, 0o555); err != nil {
		t.Fatalf("chmod node_modules: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(nodeModules, 0o755) }) // let TempDir cleanup succeed

	start := time.Now()
	out, err = runKbCreate(t, kb, env, "uninstall", "--platform", platformDir, "-y")
	elapsed := time.Since(start)

	if err == nil {
		t.Fatalf("expected uninstall to fail against an unremovable platform dir, got success:\n%s", out)
	}
	if !strings.Contains(out, "remove platform dir") {
		t.Errorf("expected error output to mention \"remove platform dir\", got:\n%s", out)
	}
	// The retry loop sleeps ~200ms/400ms/600ms = 1.2s between 3 attempts —
	// assert it actually retried rather than failing on the first try.
	if elapsed < 500*time.Millisecond {
		t.Errorf("uninstall returned in %s — too fast to have retried 3 times", elapsed)
	}
	if _, statErr := os.Stat(platformDir); statErr != nil {
		t.Errorf("platform dir should still exist after a hard uninstall failure: %v", statErr)
	}
}

// --- helpers ----------------------------------------------------------------

func mustExist(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected path to exist: %s (%v)", path, err)
	}
}

func assertSymlinkEndsWith(t *testing.T, linkPath, wantSuffix string) {
	t.Helper()
	target, err := os.Readlink(linkPath)
	if err != nil {
		t.Fatalf("readlink %s: %v", linkPath, err)
	}
	if !strings.HasSuffix(target, wantSuffix) {
		t.Fatalf("symlink %s = %q, want suffix %q", linkPath, target, wantSuffix)
	}
}

// extractReleaseID parses "installed release <id> at ..." line.
func extractReleaseID(t *testing.T, out string) string {
	t.Helper()
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "installed release ") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 3 {
			return fields[2]
		}
	}
	t.Fatalf("no 'installed release' line in output:\n%s", out)
	return ""
}
