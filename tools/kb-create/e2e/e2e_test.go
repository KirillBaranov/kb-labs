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

	// devservices.yaml must exist and be valid JSON.
	dev := filepath.Join(platformDir, ".kb", "devservices.yaml")
	data, err = os.ReadFile(dev) // #nosec G304
	if err != nil {
		t.Errorf("devservices.yaml not found: %v", err)
	} else {
		var v map[string]any
		if err := json.Unmarshal(data, &v); err != nil {
			t.Errorf("devservices.yaml invalid JSON: %v", err)
		}
	}

	// node_modules must contain core package.
	nm := filepath.Join(platformDir, "node_modules", "@kb-labs", "cli-bin")
	if _, err := os.Stat(nm); err != nil {
		t.Errorf("@kb-labs/cli-bin not installed: %v", err)
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
		if err := json.Unmarshal(devCfgBytes, &devCfg); err != nil {
			t.Fatalf("devservices.yaml invalid JSON: %v", err)
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
	mustGit(t, projectDir, "init")
	write(t, filepath.Join(projectDir, "README.md"), "# project")
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
