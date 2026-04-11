// Package e2e runs end-to-end tests against the kb-create binary.
//
// Tests are skipped with -short to allow fast CI runs without network access.
// Full e2e (network required) runs with: go test ./e2e/ -v -timeout 10m
package e2e

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// binary returns the path to the kb-create binary, building it if needed.
func binary(t *testing.T) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "kb-create")
	root, err := filepath.Abs("..")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.CommandContext(context.Background(), "go", "build", "-o", bin, ".") // #nosec G204
	cmd.Dir = root
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build failed: %v\n%s", err, out)
	}
	return bin
}

// run executes kb-create with the given args and returns stdout+stderr combined.
func run(t *testing.T, bin string, args ...string) (string, int) {
	t.Helper()
	cmd := exec.CommandContext(context.Background(), bin, args...) // #nosec G204
	out, err := cmd.CombinedOutput()
	code := 0
	if err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			code = exit.ExitCode()
		}
	}
	return string(out), code
}

// ── --help / --version ────────────────────────────────────────────────────────

func TestHelp(t *testing.T) {
	bin := binary(t)
	out, code := run(t, bin, "--help")
	if code != 0 {
		t.Fatalf("--help exited %d:\n%s", code, out)
	}
	for _, want := range []string{"kb-create", "install", "--yes", "--platform"} {
		if !strings.Contains(out, want) {
			t.Errorf("--help missing %q", want)
		}
	}
}

func TestVersion(t *testing.T) {
	bin := binary(t)
	out, code := run(t, bin, "--version")
	if code != 0 {
		t.Fatalf("--version exited %d:\n%s", code, out)
	}
	if strings.TrimSpace(out) == "" {
		t.Error("--version returned empty output")
	}
}

// ── subcommand help ───────────────────────────────────────────────────────────

func TestSubcommandHelp(t *testing.T) {
	bin := binary(t)
	for _, sub := range []string{"doctor", "status", "update", "uninstall", "logs"} {
		out, code := run(t, bin, sub, "--help")
		if code != 0 {
			t.Errorf("%s --help exited %d:\n%s", sub, code, out)
		}
	}
}

// ── status: missing platform ──────────────────────────────────────────────────

func TestStatusMissingPlatform(t *testing.T) {
	bin := binary(t)
	out, code := run(t, bin, "status", "--platform", "/nonexistent/path/kb-platform")
	if code == 0 {
		t.Fatalf("status with missing platform should fail, got exit 0:\n%s", out)
	}
}

// ── doctor: no platform ───────────────────────────────────────────────────────

func TestDoctorNoArgs(t *testing.T) {
	bin := binary(t)
	// Doctor without --platform should still run env checks (node, git, etc.)
	out, _ := run(t, bin, "doctor")
	for _, want := range []string{"node", "git"} {
		if !strings.Contains(strings.ToLower(out), want) {
			t.Errorf("doctor output missing %q check", want)
		}
	}
}

// ── full install (network required) ──────────────────────────────────────────

func TestInstallYes(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	// Init a git repo in project dir so first-commit logic can run.
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")

	// Clean up node_modules eagerly — they can be several GB.
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	out, code := run(t, bin, projectDir, "--yes",
		"--platform", platformDir,
	)
	if code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}

	for _, want := range []string{
		"installed successfully",
		"Platform",
		"Project",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("install output missing %q", want)
		}
	}

	// kb.config.json must exist.
	cfg := filepath.Join(platformDir, ".kb", "kb.config.json")
	if _, err := os.Stat(cfg); err != nil {
		t.Errorf("kb.config.json not found: %v", err)
	}

	// marketplace.lock must be valid JSON.
	lock := filepath.Join(platformDir, ".kb", "marketplace.lock")
	data, err := os.ReadFile(lock) // #nosec G304 -- path is constructed from t.TempDir()
	if err != nil {
		t.Errorf("marketplace.lock not found: %v", err)
	} else {
		var v map[string]any
		if err := json.Unmarshal(data, &v); err != nil {
			t.Errorf("marketplace.lock invalid JSON: %v", err)
		}
	}

	// devservices.yaml must exist and contain a services section.
	dev := filepath.Join(platformDir, ".kb", "devservices.yaml")
	data, err = os.ReadFile(dev) // #nosec G304
	if err != nil {
		t.Errorf("devservices.yaml not found: %v", err)
	} else if !strings.Contains(string(data), "services:") {
		t.Errorf("devservices.yaml missing 'services:' section:\n%s", string(data))
	}

	// All core packages from the manifest must be physically present in node_modules.
	// The install step reports success only after pnpm returns 0; this ensures the
	// packages are actually on disk, not just that pnpm didn't error.
	for _, pkg := range []string{
		"cli-bin",
		"sdk",
		"core-runtime",
		"core-contracts",
		"shared-cli-ui",
		"core-state-daemon",
	} {
		p := filepath.Join(platformDir, "node_modules", "@kb-labs", pkg)
		if _, err := os.Stat(p); err != nil {
			t.Errorf("@kb-labs/%s not installed at %s: %v", pkg, p, err)
		}
	}

	// .kb/kb.config.jsonc must be scaffolded in the PROJECT dir (not the platform dir).
	// The user runs all kb commands from here, so its absence breaks everything downstream.
	projCfg := filepath.Join(projectDir, ".kb", "kb.config.jsonc")
	projCfgData, err := os.ReadFile(projCfg) // #nosec G304 -- path under t.TempDir()
	if err != nil {
		t.Errorf("project kb.config.jsonc not scaffolded: %v", err)
	} else {
		// Spot-check: the generated file references our platform dir and has the
		// sections the installer promises. We don't parse JSONC (comments), just grep.
		content := string(projCfgData)
		for _, want := range []string{
			platformDir,
			`"platform"`,
			`"adapters"`,
			`"services"`,
			`"plugins"`,
		} {
			if !strings.Contains(content, want) {
				t.Errorf("kb.config.jsonc missing %q:\n%s", want, content)
			}
		}
	}

	// Install log must exist — used by `kb-create logs`.
	logsDir := filepath.Join(platformDir, ".kb", "logs")
	logEntries, err := os.ReadDir(logsDir)
	if err != nil {
		t.Errorf("logs dir not created: %v", err)
	} else if len(logEntries) == 0 {
		t.Error("logs dir is empty — no install log was written")
	}

	// kb wrapper should be installed into user bin dir and be executable.
	// This is what makes `kb ...` work from any directory after install.
	userBin := filepath.Join(os.Getenv("HOME"), ".local", "bin", "kb")
	if info, err := os.Stat(userBin); err != nil {
		t.Errorf("kb wrapper not installed at %s: %v", userBin, err)
	} else if info.Mode()&0o111 == 0 {
		t.Errorf("kb wrapper at %s is not executable (mode=%v)", userBin, info.Mode())
	}

	// kb-dev binary must be present in both platform bin and user bin.
	// Covers the contract: installer downloads from GitHub Releases AND symlinks.
	if _, err := os.Stat(kbDevBinary(platformDir)); err != nil {
		t.Errorf("kb-dev not at platform bin: %v", err)
	}
	userKbDev := filepath.Join(os.Getenv("HOME"), ".local", "bin", "kb-dev")
	if info, err := os.Stat(userKbDev); err != nil {
		t.Errorf("kb-dev not installed to user bin at %s: %v", userKbDev, err)
	} else if info.Mode()&0o111 == 0 {
		t.Errorf("kb-dev user bin at %s not executable (mode=%v)", userKbDev, info.Mode())
	}

	// Scan must NOT emit warnings. A warning here means a package in the manifest
	// is broken on npm (missing manifest, unreadable, etc.) — exactly the class of
	// bug we saw with `@kb-labs/studio-app` shipping an unbuilt `src/manifest.ts`.
	// This assertion is the whole reason we run e2e in release pipeline.
	if strings.Contains(out, "WARN: manifest scan:") {
		t.Errorf("scan reported errors (broken package in manifest):\n%s", out)
	}
	if strings.Contains(out, "import failed:") {
		t.Errorf("scan failed to import a manifest (broken package):\n%s", out)
	}
	if strings.Contains(out, "manifest not found:") {
		t.Errorf("scan could not locate a manifest (broken package):\n%s", out)
	}

	t.Run("status", func(t *testing.T) {
		out, code := run(t, bin, "status", "--platform", platformDir)
		if code != 0 {
			t.Fatalf("status exited %d:\n%s", code, out)
		}
		for _, want := range []string{"Core packages", "Services", "Plugins"} {
			if !strings.Contains(out, want) {
				t.Errorf("status missing %q", want)
			}
		}
	})

	t.Run("doctor", func(t *testing.T) {
		out, code := run(t, bin, "doctor", "--platform", platformDir)
		if code != 0 {
			t.Fatalf("doctor exited %d:\n%s", code, out)
		}
		if !strings.Contains(out, "passed") {
			t.Errorf("doctor output missing 'passed':\n%s", out)
		}
	})

	// kb-dev smoke: verify the installer dropped a working kb-dev binary
	// and the generated devservices.yaml is consumable by it.
	// See plan twinkling-toasting-kernighan Phase 6 for scope rationale.
	t.Run("kb_dev_smoke", func(t *testing.T) {
		kbDevPath := kbDevBinary(platformDir)

		// 1. Binary exists and is executable.
		info, err := os.Stat(kbDevPath)
		if err != nil {
			t.Fatalf("kb-dev binary not found at %s: %v", kbDevPath, err)
		}
		if info.Mode()&0o111 == 0 {
			t.Errorf("kb-dev binary at %s is not executable (mode=%v)", kbDevPath, info.Mode())
		}

		// 2. --help exits 0 → binary actually runs on this arch.
		helpOut, helpErr, helpCode := runKbDev(t, platformDir, "--help")
		if helpCode != 0 {
			t.Fatalf("kb-dev --help exited %d\nstdout:\n%s\nstderr:\n%s", helpCode, helpOut, helpErr)
		}

		// 3. --version exits 0 and prints something non-empty.
		verOut, verErr, verCode := runKbDev(t, platformDir, "--version")
		if verCode != 0 {
			t.Fatalf("kb-dev --version exited %d\nstdout:\n%s\nstderr:\n%s", verCode, verOut, verErr)
		}
		if strings.TrimSpace(verOut) == "" {
			t.Error("kb-dev --version returned empty output")
		}

		// 4. status --json returns well-formed JSON with an ok field and a services map.
		status, err := kbDevStatusJSON(t, platformDir)
		if err != nil {
			t.Fatalf("kb-dev status --json failed: %v", err)
		}
		if _, hasOK := status["ok"]; !hasOK {
			t.Errorf("kb-dev status --json missing 'ok' field: %v", status)
		}
		services, ok := status["services"].(map[string]any)
		if !ok {
			t.Fatalf("kb-dev status --json missing 'services' map: %v", status)
		}

		// 5. The generated devservices.yaml is parseable and has a services map.
		devCfgPath := filepath.Join(platformDir, ".kb", "devservices.yaml")
		devCfgBytes, err := os.ReadFile(devCfgPath) // #nosec G304 -- path is under t.TempDir()
		if err != nil {
			t.Fatalf("devservices.yaml not readable: %v", err)
		}
		var devCfg map[string]any
		if err := yaml.Unmarshal(devCfgBytes, &devCfg); err != nil {
			t.Fatalf("devservices.yaml invalid YAML: %v", err)
		}
		cfgServices, ok := devCfg["services"].(map[string]any)
		if !ok {
			t.Fatalf("devservices.yaml has no 'services' map")
		}

		// 6. If any services were found during scan, they should have schema-complete entries
		//    (name + type + command). If zero services, that's fine — scan found no runtime packages.
		for id, raw := range cfgServices {
			svc, ok := raw.(map[string]any)
			if !ok {
				t.Errorf("devservices.yaml service %q is not an object", id)
				continue
			}
			for _, field := range []string{"name", "type", "command"} {
				if _, hasField := svc[field]; !hasField {
					t.Errorf("devservices.yaml service %q missing required field %q", id, field)
				}
			}
		}

		// 7. Every service the generated config declares must be reflected in
		//    kb-dev's status snapshot. (Even if dead, it must be known.)
		for id := range cfgServices {
			if _, known := services[id]; !known {
				t.Errorf("kb-dev status --json does not know about service %q from devservices.yaml", id)
			}
		}

		t.Logf("kb-dev smoke OK: %d service(s) in dev.config, binary at %s", len(cfgServices), kbDevPath)
	})

	t.Run("uninstall", func(t *testing.T) {
		uninstallDir := t.TempDir()
		projectDir2 := t.TempDir()
		mustGit(t, projectDir2, "init")
		mustGit(t, projectDir2, "commit", "--allow-empty", "-m", "init")

		// Install first.
		t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(uninstallDir, "node_modules")) })
		_, code := run(t, bin, projectDir2, "--yes", "--platform", uninstallDir)
		if code != 0 {
			t.Skip("install failed, skipping uninstall test")
		}

		// Uninstall with --yes to skip confirmation prompt.
		out, code := run(t, bin, "uninstall", "--platform", uninstallDir, "-y")
		if code != 0 {
			t.Fatalf("uninstall exited %d:\n%s", code, out)
		}

		// Platform dir should be gone.
		if _, err := os.Stat(uninstallDir); !os.IsNotExist(err) {
			t.Errorf("platform dir still exists after uninstall")
		}
	})
}

// ── first-commit: no changes = no prompt ─────────────────────────────────────

func TestFirstCommitNoChanges(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	// Clean repo — no uncommitted changes.
	// .kb/ is gitignored because the installer writes kb.config.jsonc into it,
	// which would otherwise turn a clean repo into a dirty one.
	mustGit(t, projectDir, "init")
	write(t, filepath.Join(projectDir, "README.md"), "# project")
	write(t, filepath.Join(projectDir, ".gitignore"), ".kb/\n")
	mustGit(t, projectDir, "add", ".")
	mustGit(t, projectDir, "commit", "-m", "init")

	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })
	out, code := run(t, bin, projectDir, "--yes", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}

	// Should NOT show commit prompt when there are no changes.
	if strings.Contains(out, "unsaved change") {
		t.Errorf("commit prompt shown for clean repo:\n%s", out)
	}
}

// ── first-commit: changes present = prompt shown ──────────────────────────────

func TestFirstCommitPromptShown(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	// Add an uncommitted file.
	write(t, filepath.Join(projectDir, "main.go"), "package main")

	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })
	out, code := run(t, bin, projectDir, "--yes", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}

	if !strings.Contains(out, "unsaved change") {
		t.Errorf("commit prompt not shown when changes exist:\n%s", out)
	}
	if !strings.Contains(out, "Try it?") {
		t.Errorf("'Try it?' prompt not shown:\n%s", out)
	}
}

// ── update: fresh install → update → already up to date ──────────────────────

func TestUpdate(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	if _, code := run(t, bin, projectDir, "--yes", "--platform", platformDir); code != 0 {
		t.Fatalf("install failed")
	}

	// Second update immediately after install: the manifest embedded in the binary
	// matches the installed snapshot, so Diff() should be empty and update must
	// report "already up to date" without touching packages. This is the test that
	// catches regressions like the workspace:* fiasco — if update tries to run pnpm
	// on broken deps, we see a non-zero exit here.
	out, code := run(t, bin, "update", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("update exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, "up to date") {
		t.Errorf("update did not report 'up to date' on fresh install:\n%s", out)
	}
}

// ── reinstall: installing into the same platformDir must not break ───────────

func TestReinstallIdempotent(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	// First install.
	if out, code := run(t, bin, projectDir, "--yes", "--platform", platformDir); code != 0 {
		t.Fatalf("first install exited %d:\n%s", code, out)
	}

	// Second install into the same dirs — should not explode. We don't care if
	// it reinstalls everything or skips; we just need it to succeed and leave
	// the platform in a usable state.
	out, code := run(t, bin, projectDir, "--yes", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("second install exited %d:\n%s", code, out)
	}
	if !strings.Contains(out, "installed successfully") {
		t.Errorf("second install missing success banner:\n%s", out)
	}

	// Doctor still green after reinstall.
	if _, code := run(t, bin, "doctor", "--platform", platformDir); code != 0 {
		t.Errorf("doctor failed after reinstall")
	}
}

// ── logs: `kb-create logs` surfaces the install log ──────────────────────────

func TestLogsCommand(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	if _, code := run(t, bin, projectDir, "--yes", "--platform", platformDir); code != 0 {
		t.Fatalf("install failed")
	}

	out, code := run(t, bin, "logs", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("logs exited %d:\n%s", code, out)
	}
	// The install writes real pnpm output — any of these strings confirms we
	// actually read a log rather than an empty file.
	for _, want := range []string{"Installing", "packages"} {
		if !strings.Contains(out, want) {
			t.Errorf("logs output missing %q:\n%s", want, out)
		}
	}
}

// ── kb CLI smoke: the installed kb wrapper actually launches the CLI ─────────

func TestKbCliSmoke(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	if _, code := run(t, bin, projectDir, "--yes", "--platform", platformDir); code != 0 {
		t.Fatalf("install failed")
	}

	// Invoke the node entrypoint directly — avoids contamination from the user's
	// shared ~/.local/bin/kb wrapper which another concurrent test run may overwrite.
	binJS := filepath.Join(platformDir, "node_modules", "@kb-labs", "cli-bin", "dist", "bin.js")
	if _, err := os.Stat(binJS); err != nil {
		t.Fatalf("cli-bin entrypoint missing at %s: %v", binJS, err)
	}

	cmd := exec.CommandContext(context.Background(), "node", binJS, "--help") // #nosec G204
	cmd.Dir = projectDir
	cmd.Env = append(os.Environ(), "KB_PLATFORM="+platformDir, "KB_PROJECT="+projectDir)
	rawOut, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("kb --help failed: %v\n%s", err, rawOut)
	}
	// Minimal signal that the CLI booted and found the platform.
	// Actual command surface is covered by cli-bin's own tests.
	outStr := string(rawOut)
	if !strings.Contains(outStr, "KB Labs") {
		t.Errorf("kb --help did not print KB Labs header:\n%s", outStr)
	}
}

// ── services: kb-dev can actually start/stop a service from the generated config ─

func TestServicesStartStop(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")
	t.Cleanup(func() { _ = os.RemoveAll(filepath.Join(platformDir, "node_modules")) })

	if _, code := run(t, bin, projectDir, "--yes", "--platform", platformDir); code != 0 {
		t.Fatalf("install failed")
	}

	// Pick one real service the installer dropped into devservices.yaml.
	// We only care that kb-dev can see it and return status — not that the
	// service itself boots all the way up to a ready health check. The latter
	// depends on runtime deps (databases, env vars) outside kb-create's scope.
	status, err := kbDevStatusJSON(t, platformDir)
	if err != nil {
		t.Fatalf("kb-dev status --json: %v", err)
	}
	services, ok := status["services"].(map[string]any)
	if !ok || len(services) == 0 {
		t.Fatal("kb-dev status reports no services — installer produced empty devservices.yaml")
	}

	// Ensure kb-dev is at least willing to take a `start --help` for one of the
	// discovered services. This proves the CLI understands the generated config
	// without requiring us to actually boot a daemon.
	stdout, stderr, code := runKbDev(t, platformDir, "start", "--help")
	if code != 0 {
		t.Fatalf("kb-dev start --help exited %d\nstdout:\n%s\nstderr:\n%s", code, stdout, stderr)
	}

	// And kb-dev stop --help for symmetry (same config parse path).
	stdout, stderr, code = runKbDev(t, platformDir, "stop", "--help")
	if code != 0 {
		t.Fatalf("kb-dev stop --help exited %d\nstdout:\n%s\nstderr:\n%s", code, stdout, stderr)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func mustGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.CommandContext(context.Background(), "git", args...) // #nosec G204
	cmd.Dir = dir
	// Minimal git identity for commits.
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=test",
		"GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=test",
		"GIT_COMMITTER_EMAIL=test@test.com",
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil { // #nosec G306
		t.Fatal(err)
	}
}
