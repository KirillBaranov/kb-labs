package cmd

import (
	"path/filepath"
	"testing"

	"github.com/kb-labs/create/internal/config"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/manifest"
)

// TestResolvePlatformRoot_ExplicitWins guards the platform-root half of the
// same regression class as resolveProjectDir: an explicit --platform must
// never be overridden by ambient state.
func TestResolvePlatformRoot_ExplicitWins(t *testing.T) {
	explicit := filepath.Join(t.TempDir(), "custom-platform")
	got, err := resolvePlatformRoot(explicit)
	if err != nil {
		t.Fatalf("resolvePlatformRoot() error = %v", err)
	}
	want, _ := filepath.Abs(explicit)
	if got != want {
		t.Errorf("resolvePlatformRoot(%q) = %q, want %q", explicit, got, want)
	}
}

// TestResolvePlatformRoot_DefaultsToHomeKbPlatform guards against a
// regression introduced by the declarative launcher cutover: `kb-create
// <name> --yes` without --platform used to install the platform at the
// documented default, ~/kb-platform (README.md: "~/kb-platform is the
// default... independent from your project... shared across multiple
// projects"), decoupled from the newly created project directory.
// cmd/flow.go's absoluteOrCWD(flagPlatform) silently collapsed that default
// to the process's cwd instead — this test locks in the correct default.
func TestResolvePlatformRoot_DefaultsToHomeKbPlatform(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Chdir(t.TempDir()) // cwd has no .kb/install.json pointer to follow
	got, err := resolvePlatformRoot("")
	if err != nil {
		t.Fatalf("resolvePlatformRoot() error = %v", err)
	}
	want := filepath.Join(home, "kb-platform")
	if got != want {
		t.Errorf("resolvePlatformRoot(\"\") = %q, want %q (documented ~/kb-platform default)", got, want)
	}
}

// TestResolvePlatformRoot_FollowsExistingProjectPointer verifies that when
// cwd is already bound to a platform (a prior install's .kb/install.json
// pointer), an unset --platform reuses that binding rather than the
// ~/kb-platform default — matching runDeclarativeInstall's long-standing
// re-install behavior.
func TestResolvePlatformRoot_FollowsExistingProjectPointer(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	projectDir := t.TempDir()
	t.Chdir(projectDir)
	boundPlatform := filepath.Join(t.TempDir(), "bound-platform")
	if err := config.Write(".", &config.PlatformConfig{Platform: boundPlatform}); err != nil {
		t.Fatalf("seed project pointer: %v", err)
	}
	got, err := resolvePlatformRoot("")
	if err != nil {
		t.Fatalf("resolvePlatformRoot() error = %v", err)
	}
	if got != boundPlatform {
		t.Errorf("resolvePlatformRoot(\"\") = %q, want %q (existing project pointer)", got, boundPlatform)
	}
}

// TestWriteDeclarativeInstallState_WritesProjectCopyWhenDistinctFromPlatform
// guards against a regression where `kb-create <name> --platform <dir>`
// (platform and project in separate directories — the common case) left the
// freshly created project with no `.kb/install.json` at all: install state
// was only ever persisted at PlatformRoot, so a fresh project's own
// "install manifest written" gate had nothing to find, and any subsequent
// kb-create command run from inside the project (no --platform) had no
// cwd-based config.Read fallback to resolve the platform from.
func TestWriteDeclarativeInstallState_WritesProjectCopyWhenDistinctFromPlatform(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	compiled := engineplan.InstallPlan{
		Schema:       "kb.install/1",
		PlatformRoot: platformDir,
		ProjectRoot:  projectDir,
	}
	if err := writeDeclarativeInstallState(compiled, &manifest.Manifest{}, manifest.ResolvedAxes{}); err != nil {
		t.Fatalf("writeDeclarativeInstallState() error = %v", err)
	}

	platformCfg, err := config.Read(platformDir)
	if err != nil {
		t.Fatalf("config.Read(platformDir) error = %v", err)
	}
	if platformCfg.Platform != platformDir {
		t.Errorf("platform install.json Platform = %q, want %q", platformCfg.Platform, platformDir)
	}

	projectCfg, err := config.Read(projectDir)
	if err != nil {
		t.Fatalf("config.Read(projectDir) error = %v — project .kb/install.json was not written", err)
	}
	if projectCfg.Platform != platformDir {
		t.Errorf("project install.json Platform = %q, want %q (pointer back to platform)", projectCfg.Platform, platformDir)
	}
}

// TestWriteDeclarativeInstallState_SkipsProjectCopyWhenSameAsPlatform covers
// the single-directory install case (platform == project, e.g. `kb-create
// install` run from inside an existing platform dir): writing the same
// content to the same path twice must not error.
func TestWriteDeclarativeInstallState_SkipsProjectCopyWhenSameAsPlatform(t *testing.T) {
	dir := t.TempDir()
	compiled := engineplan.InstallPlan{
		Schema:       "kb.install/1",
		PlatformRoot: dir,
		ProjectRoot:  dir,
	}
	if err := writeDeclarativeInstallState(compiled, &manifest.Manifest{}, manifest.ResolvedAxes{}); err != nil {
		t.Fatalf("writeDeclarativeInstallState() error = %v", err)
	}
	if _, err := config.Read(dir); err != nil {
		t.Fatalf("config.Read(dir) error = %v", err)
	}
}
