package e2e

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// TestPlatformUpdateAndUninstallPreservesUserArtifacts is the destructive
// lifecycle journey: a user updates a working platform, declines an uninstall,
// then confirms it. Platform-owned runtime files may disappear only after the
// explicit confirmation; project source and user-authored KB artifacts must
// remain available afterwards.
func TestPlatformUpdateAndUninstallPreservesUserArtifacts(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")

	userSource := filepath.Join(projectDir, "src", "user-file.ts")
	userEnv := filepath.Join(projectDir, ".env")
	userWorkflow := filepath.Join(projectDir, ".kb", "workflows", "user-value.yaml")
	write(t, userSource, "export const userValue = 'keep-me'\n")
	write(t, userEnv, "USER_SECRET=keep-me\n")
	write(t, userWorkflow, "name: user-value\nversion: 1.0.0\non:\n  manual: true\njobs:\n  verify:\n    runsOn: local\n    steps:\n      - name: Verify\n        run: echo keep-me\n")

	if out, code := run(t, bin, projectDir, "--yes", "--platform", platformDir); code != 0 {
		t.Fatalf("install exited %d:\n%s", code, out)
	}

	before := map[string][]byte{}
	for name, path := range map[string]string{
		"source":   userSource,
		"env":      userEnv,
		"workflow": userWorkflow,
	} {
		data, err := os.ReadFile(path) // #nosec G304 -- paths are under t.TempDir()
		if err != nil {
			t.Fatalf("read %s before update: %v", name, err)
		}
		before[name] = data
	}

	if out, code := run(t, bin, "update", "--yes", "--platform", platformDir); code != 0 {
		t.Fatalf("update exited %d:\n%s", code, out)
	}
	assertUserArtifactsUnchanged(t, before, userSource, userEnv, userWorkflow)

	// A destructive command without confirmation must be a no-op. The command
	// receives EOF in this non-interactive test, which is equivalent to the
	// user choosing the safe default "No".
	out, code := run(t, bin, "uninstall", "--platform", platformDir)
	if code != 0 {
		t.Fatalf("unconfirmed uninstall exited %d:\n%s", code, out)
	}
	if !strings.Contains(strings.ToLower(out), "cancel") {
		t.Errorf("unconfirmed uninstall did not report cancellation:\n%s", out)
	}
	if _, err := os.Stat(platformDir); err != nil {
		t.Fatalf("platform disappeared without confirmation: %v", err)
	}
	assertUserArtifactsUnchanged(t, before, userSource, userEnv, userWorkflow)

	// Explicit confirmation is the only path allowed to remove the runtime.
	if out, code = run(t, bin, "uninstall", "--platform", platformDir, "--yes"); code != 0 {
		t.Fatalf("confirmed uninstall exited %d:\n%s", code, out)
	}
	if _, err := os.Stat(platformDir); !os.IsNotExist(err) {
		t.Errorf("platform directory still exists after confirmed uninstall: %v", err)
	}
	assertUserArtifactsUnchanged(t, before, userSource, userEnv, userWorkflow)
}

func assertUserArtifactsUnchanged(t *testing.T, before map[string][]byte, userSource, userEnv, userWorkflow string) {
	t.Helper()
	for name, path := range map[string]string{
		"source":   userSource,
		"env":      userEnv,
		"workflow": userWorkflow,
	} {
		data, err := os.ReadFile(path) // #nosec G304 -- paths are under t.TempDir()
		if err != nil {
			t.Errorf("user %s was removed: %v", name, err)
			continue
		}
		if string(data) != string(before[name]) {
			t.Errorf("user %s was modified", name)
		}
	}
}

// TestAdapterSwitchJourney proves that adapter selection is an actual
// install/configuration journey. It installs one storage adapter, switches to
// another through the supported CLI, and checks the resulting runtime config
// and artifacts instead of accepting a successful exit code alone.
func TestAdapterSwitchJourney(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping network test in -short mode")
	}

	bin := binary(t)
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	mustGit(t, projectDir, "init")
	mustGit(t, projectDir, "commit", "--allow-empty", "-m", "init")

	install := func(adapter string) string {
		out, code := run(t, bin, "install", "--plugins", "scaffold", "--adapters", "storage="+adapter, "--platform", platformDir)
		if code != 0 {
			t.Fatalf("install with storage adapter %s exited %d:\n%s", adapter, code, out)
		}
		return out
	}

	install("@kb-labs/adapters-fs")
	assertPlatformConfigContains(t, platformDir, `"storage": "@kb-labs/adapters-fs"`)
	if _, err := os.Stat(filepath.Join(platformDir, "node_modules", "@kb-labs", "adapters-fs")); err != nil {
		t.Fatalf("filesystem adapter artifact missing: %v", err)
	}

	install("@kb-labs/adapters-sqlite")
	assertPlatformConfigContains(t, platformDir, `"storage": "@kb-labs/adapters-sqlite"`)
	if _, err := os.Stat(filepath.Join(platformDir, "node_modules", "@kb-labs", "adapters-sqlite")); err != nil {
		t.Fatalf("sqlite adapter artifact missing after switch: %v", err)
	}

	if out, code := run(t, bin, "doctor", "--platform", platformDir); code != 0 {
		t.Fatalf("doctor after adapter switch exited %d:\n%s", code, out)
	}
}

func assertPlatformConfigContains(t *testing.T, platformDir, want string) {
	t.Helper()
	path := filepath.Join(platformDir, ".kb", "kb.config.jsonc")
	data, err := os.ReadFile(path) // #nosec G304 -- path is under t.TempDir()
	if err != nil {
		t.Fatalf("read platform config: %v", err)
	}
	if !strings.Contains(string(data), want) {
		t.Fatalf("platform config missing %q:\n%s", want, data)
	}
}

// runInDir models a CI job invoking kb-create from its checked-out project,
// rather than from the launcher repository or the platform directory.
func runInDir(t *testing.T, bin, dir string, args ...string) (string, int) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, args...) // #nosec G204 -- test args are constants
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	code := 0
	if err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			code = exit.ExitCode()
		} else if ctx.Err() != nil {
			t.Fatalf("command %v timed out after %s\noutput:\n%s", args, runTimeout, out)
		}
	}
	return string(out), code
}
