package cmd

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/cobra"

	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/userstate"
)

// newResolveTestCmd returns a minimal cobra command tree that mirrors the
// flag setup rootCmd/updateCmd use, so resolvePlatformDir has the same
// lookup surface as in production.
func newResolveTestCmd() *cobra.Command {
	root := &cobra.Command{Use: "kb-create"}
	root.PersistentFlags().String("platform", "", "platform installation directory")

	child := &cobra.Command{Use: "status"}
	child.Flags().String("platform", "", "platform installation directory (overrides wizard default)")
	root.AddCommand(child)
	return child
}

// isolateUserState points userstate at a temp dir and chdir's to a clean
// temp dir so neither a real ~/.local/state/kb-create nor a real .kb/kb.config
// can leak into the test.
func isolateUserState(t *testing.T) {
	t.Helper()
	t.Setenv("KB_CREATE_STATE_HOME", t.TempDir())
	t.Setenv("XDG_STATE_HOME", "")

	// Chdir to a clean temp dir so config.Read(cwd) returns "not found".
	cwd := t.TempDir()
	prev, _ := os.Getwd()
	if err := os.Chdir(cwd); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(prev) })
}

func TestResolvePlatformDir_FlagWins(t *testing.T) {
	isolateUserState(t)

	cmd := newResolveTestCmd()
	// Write a bogus userstate so we can prove the flag wins.
	if err := userstate.Write(&userstate.State{LastPlatformDir: "/from/state"}); err != nil {
		t.Fatal(err)
	}
	_ = cmd.Flags().Set("platform", "/from/flag")

	got, err := resolvePlatformDir(cmd)
	if err != nil {
		t.Fatalf("resolvePlatformDir: %v", err)
	}
	if got != "/from/flag" {
		t.Errorf("got %q, want /from/flag", got)
	}
}

// Happy-path regression for Issue 2: after an install, `kb-create status`
// (no flag, not in platform dir) must work because the installer wrote
// the platform path into user state.
func TestResolvePlatformDir_FallsBackToUserState(t *testing.T) {
	isolateUserState(t)

	// Create a real platform dir on disk so the stat check passes.
	platformDir := t.TempDir()
	if err := userstate.Write(&userstate.State{LastPlatformDir: platformDir}); err != nil {
		t.Fatal(err)
	}

	cmd := newResolveTestCmd()
	got, err := resolvePlatformDir(cmd)
	if err != nil {
		t.Fatalf("resolvePlatformDir: %v", err)
	}
	if got != platformDir {
		t.Errorf("got %q, want %q", got, platformDir)
	}
}

// Stale userstate (dir removed out-of-band) must not be trusted — the
// command should error out with the clear "not specified" message instead
// of returning a ghost path.
func TestResolvePlatformDir_IgnoresStaleUserState(t *testing.T) {
	isolateUserState(t)

	ghost := filepath.Join(t.TempDir(), "deleted-platform")
	if err := userstate.Write(&userstate.State{LastPlatformDir: ghost}); err != nil {
		t.Fatal(err)
	}

	cmd := newResolveTestCmd()
	_, err := resolvePlatformDir(cmd)
	if err == nil {
		t.Fatal("expected error for stale userstate, got nil")
	}
}

// When neither flag, cwd config, nor userstate yield a platform dir, the
// command must return a clear error (not an empty string + nil).
func TestResolvePlatformDir_ErrorWhenNothingKnown(t *testing.T) {
	isolateUserState(t)

	cmd := newResolveTestCmd()
	_, err := resolvePlatformDir(cmd)
	if err == nil {
		t.Fatal("expected error when no source knows the platform")
	}
}

// cwd-based config discovery still wins over userstate — preserving the
// legacy "run from the platform dir" workflow.
func TestResolvePlatformDir_CwdConfigBeatsUserState(t *testing.T) {
	isolateUserState(t)

	// Stage a real .kb/kb.config.json in the cwd pointing at dirA.
	cwd, _ := os.Getwd()
	dirA := t.TempDir()
	cfg := config.NewConfig(dirA, cwd, "pnpm", "", "", &manifest.Manifest{}, config.TelemetryConfig{})
	if err := config.Write(cwd, cfg); err != nil {
		t.Fatalf("config.Write: %v", err)
	}

	// Seed userstate with a different dirB so we can detect if it leaks.
	dirB := t.TempDir()
	if err := userstate.Write(&userstate.State{LastPlatformDir: dirB}); err != nil {
		t.Fatal(err)
	}

	cmd := newResolveTestCmd()
	got, err := resolvePlatformDir(cmd)
	if err != nil {
		t.Fatalf("resolvePlatformDir: %v", err)
	}
	if got != dirA {
		t.Errorf("got %q, want cwd-config dirA %q (userstate dirB=%q must not win)", got, dirA, dirB)
	}
}
