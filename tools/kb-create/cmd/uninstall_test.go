package cmd

import (
	"os"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/userstate"
)

// BUG-05: `kb-create uninstall --yes` run from a project whose own
// .kb/kb.config.jsonc can't be read must never fall back to the global
// "last known platform" in userstate — that state is directory-independent,
// so it can point at a completely different, earlier-created project. The
// reported symptom: running uninstall from /tmp/work2/my-project printed
// "Project: /tmp/work2/second-project" and would have deleted that platform
// instead of erroring out.
func TestResolvePlatformDirForUninstall_IgnoresUserStateFallback(t *testing.T) {
	isolateUserState(t)

	// userstate points at an unrelated, real platform dir (as if a different
	// project was installed earlier in this session).
	otherPlatform := t.TempDir()
	if err := userstate.Write(&userstate.State{LastPlatformDir: otherPlatform}); err != nil {
		t.Fatal(err)
	}

	cmd := newResolveTestCmd()
	_, err := resolvePlatformDirForUninstall(cmd)
	if err == nil {
		t.Fatal("expected error when cwd has no platform config, got nil (userstate fallback leaked in)")
	}
	if !strings.Contains(err.Error(), "--platform") {
		t.Errorf("error should hint at --platform, got: %v", err)
	}
}

// The flag override still works — an explicit --platform is exactly the
// escape hatch the fix asks users to use instead of relying on cached state.
func TestResolvePlatformDirForUninstall_FlagWins(t *testing.T) {
	isolateUserState(t)

	cmd := newResolveTestCmd()
	_ = cmd.Flags().Set("platform", "/from/flag")

	got, err := resolvePlatformDirForUninstall(cmd)
	if err != nil {
		t.Fatalf("resolvePlatformDirForUninstall: %v", err)
	}
	if got != "/from/flag" {
		t.Errorf("got %q, want /from/flag", got)
	}
}

// Running uninstall from inside the actual project directory (with a valid
// .kb/kb.config.jsonc pointing at its own platform) must keep working without
// needing --platform.
func TestResolvePlatformDirForUninstall_CwdConfigResolves(t *testing.T) {
	isolateUserState(t)

	cwd, _ := os.Getwd()
	platformDir := t.TempDir()
	cfg := config.NewConfig(platformDir, cwd, "pnpm", "", "", &manifest.Manifest{}, config.TelemetryConfig{})
	if err := config.Write(cwd, cfg); err != nil {
		t.Fatalf("config.Write: %v", err)
	}

	// Seed userstate with a different, unrelated platform to prove it's ignored.
	unrelated := t.TempDir()
	if err := userstate.Write(&userstate.State{LastPlatformDir: unrelated}); err != nil {
		t.Fatal(err)
	}

	cmd := newResolveTestCmd()
	got, err := resolvePlatformDirForUninstall(cmd)
	if err != nil {
		t.Fatalf("resolvePlatformDirForUninstall: %v", err)
	}
	if got != platformDir {
		t.Errorf("got %q, want cwd-config platformDir %q (unrelated userstate dir=%q must not win)", got, platformDir, unrelated)
	}
}
