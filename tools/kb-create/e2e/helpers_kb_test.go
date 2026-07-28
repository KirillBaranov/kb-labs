// Helpers for invoking the installed `kb` CLI (via its node entrypoint) and
// for running package-manager commands inside a scaffolded plugin directory —
// shared by the journey tests, which chain kb-create install with `kb`
// subcommands and a bare `pnpm build` the way a real user would.

package e2e

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// kbBinJS returns the path to the installed CLI's node entrypoint.
func kbBinJS(platformDir string) string {
	return filepath.Join(platformDir, "node_modules", "@kb-labs", "cli-bin", "dist", "bin.js")
}

// runKb invokes the installed `kb` CLI with the given args, cwd=projectDir,
// KB_PLATFORM/KB_PROJECT pointed at the test's install — same invocation
// shape as TestKbCliSmoke, factored out so journey tests can chain multiple
// `kb` subcommands after a single install.
func runKb(t *testing.T, platformDir, projectDir string, args ...string) (string, int) {
	return runKbIn(t, platformDir, projectDir, projectDir, args...)
}

func runKbIn(t *testing.T, platformDir, projectDir, cwd string, args ...string) (string, int) {
	t.Helper()
	binJS := kbBinJS(platformDir)
	if _, err := os.Stat(binJS); err != nil {
		t.Fatalf("cli-bin entrypoint missing at %s: %v", binJS, err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", append([]string{binJS}, args...)...) // #nosec G204
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "KB_PLATFORM="+platformDir, "KB_PROJECT="+projectDir)
	out, err := cmd.CombinedOutput()
	code := 0
	if err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			code = exit.ExitCode()
		} else if ctx.Err() != nil {
			t.Fatalf("kb %v timed out after %s\noutput:\n%s", args, runTimeout, out)
		}
	}
	return string(out), code
}

// testRegistry returns the npm registry override tests should pass to
// package-manager commands run OUTSIDE kb-create itself (e.g. a bare `pnpm
// install` inside a scaffolded plugin). kb-create's own subprocess calls pick
// KB_REGISTRY_URL up automatically (see internal/pm), but a plain pnpm
// invocation doesn't know about that env var, so callers must pass
// --registry explicitly. Empty means "whatever pnpm is already configured
// for" (real npm, in local dev without KB_REGISTRY_URL set).
func testRegistry() string {
	return os.Getenv("KB_REGISTRY_URL")
}

// pnpmNetworkSubcommands are the pnpm subcommands that actually hit a
// registry — --registry is only a valid flag for these. `pnpm run build`
// (or any `run`/exec of a package script) doesn't take --registry at all;
// cac (pnpm's CLI parser) rejects it as an unknown option.
var pnpmNetworkSubcommands = map[string]bool{
	"install": true,
	"i":       true,
	"add":     true,
	"update":  true,
	"up":      true,
}

// runPM runs a pnpm command in dir, pointed at testRegistry() when set and
// applicable — used to build a scaffolded plugin the same way a real
// developer would after `kb scaffold run` (see
// docs/qa/scenarios/S-001-solo-install-first-run.md Phase 5, steps 15-16).
func runPM(t *testing.T, dir string, args ...string) (string, int) {
	t.Helper()
	if registry := testRegistry(); registry != "" && len(args) > 0 && pnpmNetworkSubcommands[args[0]] {
		args = append(args, "--registry", registry)
	}
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "pnpm", args...) // #nosec G204
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	code := 0
	if err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			code = exit.ExitCode()
		} else if ctx.Err() != nil {
			t.Fatalf("pnpm %v timed out after %s\noutput:\n%s", args, runTimeout, out)
		}
	}
	return string(out), code
}

// readPkgVersion reads the "version" field from a package.json at a path
// relative to the repo root (e.g. "plugins/release/manager-cli/package.json").
// Used to pin a --plugins install to the exact version this checkout will
// actually publish, instead of a hardcoded number that would drift out of
// sync with the monorepo (and, in CI, doesn't exist at all — the local
// Verdaccio instance only ever has the current checkout's version).
func readPkgVersion(t *testing.T, relPath string) string {
	t.Helper()
	repoRoot, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(repoRoot, relPath)) // #nosec G304 -- relPath is a caller-supplied constant
	if err != nil {
		t.Fatalf("read %s: %v", relPath, err)
	}
	var pkg struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		t.Fatalf("parse %s: %v", relPath, err)
	}
	if pkg.Version == "" {
		t.Fatalf("%s has no version field", relPath)
	}
	return pkg.Version
}
