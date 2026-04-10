package installer

import (
	"os"
	"testing"

	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
)

// ── fakes ────────────────────────────────────────────────────────────────────

// fakePM is a no-op package manager for use in tests.
type fakePM struct {
	failErr error
	name    string
	failOn  string
	calls   []string
}

func (f *fakePM) Name() string { return f.name }

func (f *fakePM) Install(dir string, pkgs []string, ch chan<- pm.Progress) error {
	for _, p := range pkgs {
		f.calls = append(f.calls, "install:"+p)
		if f.failOn == p {
			return f.failErr
		}
	}
	return nil
}

func (f *fakePM) Update(dir string, pkgs []string, ch chan<- pm.Progress) error {
	for _, p := range pkgs {
		f.calls = append(f.calls, "update:"+p)
	}
	return nil
}

func (f *fakePM) ListInstalled(dir string) ([]pm.InstalledPackage, error) {
	return nil, nil
}

// sampleManifest returns a minimal manifest for testing.
func sampleManifest() manifest.Manifest {
	return manifest.Manifest{
		Version: "1.0.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}, {Name: "@kb-labs/sdk"}},
		Services: []manifest.Component{
			{ID: "rest", Pkg: "@kb-labs/rest-api", Default: true},
			{ID: "studio", Pkg: "@kb-labs/studio", Default: false},
		},
		Plugins: []manifest.Component{
			{ID: "mind", Pkg: "@kb-labs/mind", Default: true},
			{ID: "agents", Pkg: "@kb-labs/agents", Default: false},
		},
	}
}

// ── selectedPkgs ─────────────────────────────────────────────────────────────

// TestSelectedPkgsAll verifies that all matching IDs are returned.
func TestSelectedPkgsAll(t *testing.T) {
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	m := sampleManifest()

	got := ins.selectedPkgs(m.Services, []string{"rest", "studio"})
	want := []string{"@kb-labs/rest-api", "@kb-labs/studio"}

	if len(got) != len(want) {
		t.Fatalf("selectedPkgs len = %d, want %d; got %v", len(got), len(want), got)
	}
	for i, g := range got {
		if g != want[i] {
			t.Errorf("selectedPkgs[%d] = %q, want %q", i, g, want[i])
		}
	}
}

// TestSelectedPkgsSubset verifies that only the requested IDs are returned.
func TestSelectedPkgsSubset(t *testing.T) {
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	m := sampleManifest()

	got := ins.selectedPkgs(m.Services, []string{"rest"})
	if len(got) != 1 || got[0] != "@kb-labs/rest-api" {
		t.Errorf("selectedPkgs = %v, want [@kb-labs/rest-api]", got)
	}
}

// TestSelectedPkgsNone verifies that an empty ID list returns no packages.
func TestSelectedPkgsNone(t *testing.T) {
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	m := sampleManifest()

	got := ins.selectedPkgs(m.Services, nil)
	if len(got) != 0 {
		t.Errorf("selectedPkgs with nil ids = %v, want []", got)
	}
}

// TestSelectedPkgsUnknownID verifies that unknown IDs are silently ignored.
func TestSelectedPkgsUnknownID(t *testing.T) {
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	m := sampleManifest()

	got := ins.selectedPkgs(m.Services, []string{"nonexistent"})
	if len(got) != 0 {
		t.Errorf("selectedPkgs with unknown id = %v, want []", got)
	}
}

// ── HasChanges ───────────────────────────────────────────────────────────────

// TestHasChangesEmpty verifies that a diff with no entries has no changes.
func TestHasChangesEmpty(t *testing.T) {
	d := &UpdateDiff{}
	if d.HasChanges() {
		t.Error("empty UpdateDiff.HasChanges() = true, want false")
	}
}

// TestHasChangesAdded verifies that a diff with added packages has changes.
func TestHasChangesAdded(t *testing.T) {
	d := &UpdateDiff{Added: []string{"@kb-labs/new"}}
	if !d.HasChanges() {
		t.Error("UpdateDiff{Added}.HasChanges() = false, want true")
	}
}

// TestHasChangesRemoved verifies that a diff with removed packages has changes.
func TestHasChangesRemoved(t *testing.T) {
	d := &UpdateDiff{Removed: []string{"@kb-labs/old"}}
	if !d.HasChanges() {
		t.Error("UpdateDiff{Removed}.HasChanges() = false, want true")
	}
}

// TestHasChangesUpdated verifies that a diff with updated packages has changes.
func TestHasChangesUpdated(t *testing.T) {
	d := &UpdateDiff{Updated: []string{"@kb-labs/cli-bin"}}
	if !d.HasChanges() {
		t.Error("UpdateDiff{Updated}.HasChanges() = false, want true")
	}
}

// ── Diff ─────────────────────────────────────────────────────────────────────

// TestDiffDetectsAddedCorePackage verifies that a new core package in the
// current manifest appears in Diff.Added.
func TestDiffDetectsAddedCorePackage(t *testing.T) {
	dir := t.TempDir()

	installed := manifest.Manifest{
		Version: "1.0.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
	}
	cfg := config.NewConfig(dir, dir, "npm", &installed, config.TelemetryConfig{})
	if err := config.Write(dir, cfg); err != nil {
		t.Fatalf("config.Write() error = %v", err)
	}

	current := manifest.Manifest{
		Version: "1.1.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}, {Name: "@kb-labs/sdk"}},
	}

	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	diff, err := ins.Diff(dir, &current)
	if err != nil {
		t.Fatalf("Diff() error = %v", err)
	}

	if len(diff.Added) != 1 || diff.Added[0] != "@kb-labs/sdk" {
		t.Errorf("Diff.Added = %v, want [@kb-labs/sdk]", diff.Added)
	}
}

// TestDiffDetectsRemovedCorePackage verifies that a core package removed from
// the new manifest appears in Diff.Removed.
func TestDiffDetectsRemovedCorePackage(t *testing.T) {
	dir := t.TempDir()

	installed := manifest.Manifest{
		Version: "1.0.0",
		Core: []manifest.Package{
			{Name: "@kb-labs/cli-bin"},
			{Name: "@kb-labs/old-pkg"},
		},
	}
	cfg := config.NewConfig(dir, dir, "npm", &installed, config.TelemetryConfig{})
	if err := config.Write(dir, cfg); err != nil {
		t.Fatalf("config.Write() error = %v", err)
	}

	current := manifest.Manifest{
		Version: "1.1.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
	}

	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	diff, err := ins.Diff(dir, &current)
	if err != nil {
		t.Fatalf("Diff() error = %v", err)
	}

	if len(diff.Removed) != 1 || diff.Removed[0] != "@kb-labs/old-pkg" {
		t.Errorf("Diff.Removed = %v, want [@kb-labs/old-pkg]", diff.Removed)
	}
}

// TestDiffIgnoresUnselectedServices verifies that services not in
// SelectedServices are excluded from the diff entirely.
func TestDiffIgnoresUnselectedServices(t *testing.T) {
	dir := t.TempDir()

	m := manifest.Manifest{
		Version: "1.0.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
		Services: []manifest.Component{
			{ID: "rest", Pkg: "@kb-labs/rest-api"},
			{ID: "studio", Pkg: "@kb-labs/studio"},
		},
	}
	cfg := config.NewConfig(dir, dir, "npm", &m, config.TelemetryConfig{})
	cfg.SelectedServices = []string{"rest"} // studio NOT selected
	if err := config.Write(dir, cfg); err != nil {
		t.Fatalf("config.Write() error = %v", err)
	}

	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	diff, err := ins.Diff(dir, &m)
	if err != nil {
		t.Fatalf("Diff() error = %v", err)
	}

	// @kb-labs/studio should NOT appear anywhere in the diff.
	for _, pkg := range diff.Updated {
		if pkg == "@kb-labs/studio" {
			t.Error("unselected @kb-labs/studio should not be in Updated")
		}
	}
	for _, pkg := range diff.Added {
		if pkg == "@kb-labs/studio" {
			t.Error("unselected @kb-labs/studio should not be in Added")
		}
	}

	// @kb-labs/rest-api SHOULD be in Updated (installed + still in manifest).
	found := false
	for _, pkg := range diff.Updated {
		if pkg == "@kb-labs/rest-api" {
			found = true
		}
	}
	if !found {
		t.Errorf("selected @kb-labs/rest-api not found in Updated; diff = %+v", diff)
	}
}

// TestDiffIgnoresUnselectedPlugins verifies that plugins not in
// SelectedPlugins are excluded from the diff.
func TestDiffIgnoresUnselectedPlugins(t *testing.T) {
	dir := t.TempDir()

	m := manifest.Manifest{
		Version: "1.0.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
		Plugins: []manifest.Component{
			{ID: "mind", Pkg: "@kb-labs/mind"},
			{ID: "agents", Pkg: "@kb-labs/agents"},
		},
	}
	cfg := config.NewConfig(dir, dir, "npm", &m, config.TelemetryConfig{})
	cfg.SelectedPlugins = []string{"mind"} // agents NOT selected
	if err := config.Write(dir, cfg); err != nil {
		t.Fatalf("config.Write() error = %v", err)
	}

	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	diff, err := ins.Diff(dir, &m)
	if err != nil {
		t.Fatalf("Diff() error = %v", err)
	}

	for _, pkg := range diff.Updated {
		if pkg == "@kb-labs/agents" {
			t.Error("unselected @kb-labs/agents should not be in Updated")
		}
	}
}

// TestDiffNoConfigReturnsError verifies that Diff returns an error when no
// config exists in the given directory.
func TestDiffNoConfigReturnsError(t *testing.T) {
	dir := t.TempDir()
	m := sampleManifest()

	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	_, err := ins.Diff(dir, &m)
	if err == nil {
		t.Error("Diff() on missing config should return error, got nil")
	}
}

// ── Install ───────────────────────────────────────────────────────────────────

// TestInstallWritesConfig verifies that Install creates a valid config file.
func TestInstallWritesConfig(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	fake := &fakePM{name: "npm"}
	ins := &Installer{PM: fake, Log: discardLogger()}
	m := sampleManifest()

	sel := &Selection{
		PlatformDir: platformDir,
		ProjectCWD:  projectDir,
		Services:    []string{"rest"},
		Plugins:     []string{"mind"},
	}

	result, err := ins.Install(sel, &m)
	if err != nil {
		t.Fatalf("Install() error = %v", err)
	}

	if result.PlatformDir != platformDir {
		t.Errorf("Result.PlatformDir = %q, want %q", result.PlatformDir, platformDir)
	}
	if result.ConfigPath == "" {
		t.Error("Result.ConfigPath is empty")
	}

	// Config must be readable.
	cfg, err := config.Read(platformDir)
	if err != nil {
		t.Fatalf("config.Read() after Install error = %v", err)
	}
	if cfg.PM != "npm" {
		t.Errorf("config.PM = %q, want \"npm\"", cfg.PM)
	}
}

// TestInstallSavesSelection verifies that Install persists SelectedServices and SelectedPlugins.
func TestInstallSavesSelection(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	fake := &fakePM{name: "npm"}
	ins := &Installer{PM: fake, Log: discardLogger()}
	m := sampleManifest()

	sel := &Selection{
		PlatformDir: platformDir,
		ProjectCWD:  projectDir,
		Services:    []string{"rest"},
		Plugins:     []string{"mind"},
	}

	if _, err := ins.Install(sel, &m); err != nil {
		t.Fatalf("Install() error = %v", err)
	}

	cfg, err := config.Read(platformDir)
	if err != nil {
		t.Fatalf("config.Read() error = %v", err)
	}

	if len(cfg.SelectedServices) != 1 || cfg.SelectedServices[0] != "rest" {
		t.Errorf("SelectedServices = %v, want [rest]", cfg.SelectedServices)
	}
	if len(cfg.SelectedPlugins) != 1 || cfg.SelectedPlugins[0] != "mind" {
		t.Errorf("SelectedPlugins = %v, want [mind]", cfg.SelectedPlugins)
	}
}

// TestInstallCallsCorePackages verifies that core package names are passed to PM.Install.
func TestInstallCallsCorePackages(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	fake := &fakePM{name: "npm"}
	ins := &Installer{PM: fake, Log: discardLogger()}
	m := sampleManifest()

	sel := &Selection{
		PlatformDir: platformDir,
		ProjectCWD:  projectDir,
	}

	if _, err := ins.Install(sel, &m); err != nil {
		t.Fatalf("Install() error = %v", err)
	}

	// Both core packages must appear in install calls.
	seen := make(map[string]bool)
	for _, c := range fake.calls {
		seen[c] = true
	}
	for _, core := range m.CorePackageNames() {
		if !seen["install:"+core] {
			t.Errorf("core package %q not installed; calls = %v", core, fake.calls)
		}
	}
}

// TestInstallCreatesProjectKBDir verifies that Install creates <project>/.kb/.
func TestInstallCreatesProjectKBDir(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	fake := &fakePM{name: "npm"}
	ins := &Installer{PM: fake, Log: discardLogger()}
	m := sampleManifest()

	sel := &Selection{
		PlatformDir: platformDir,
		ProjectCWD:  projectDir,
	}

	if _, err := ins.Install(sel, &m); err != nil {
		t.Fatalf("Install() error = %v", err)
	}

	kbDir := projectDir + "/.kb"
	if info, err := os.Stat(kbDir); err != nil || !info.IsDir() {
		t.Errorf("project .kb dir not created at %q", kbDir)
	}
}

// TestInstallInvokesOnStep verifies that the OnStep callback fires for each stage.
func TestInstallInvokesOnStep(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	var steps []int
	fake := &fakePM{name: "npm"}
	ins := &Installer{
		PM:  fake,
		Log: discardLogger(),
		OnStep: func(step, total int, label string) {
			steps = append(steps, step)
		},
	}
	m := sampleManifest()
	sel := &Selection{PlatformDir: platformDir, ProjectCWD: projectDir}

	if _, err := ins.Install(sel, &m); err != nil {
		t.Fatalf("Install() error = %v", err)
	}

	// 3 steps: packages + scan + config (no binaries in sampleManifest)
	if len(steps) != 3 {
		t.Errorf("OnStep called %d times, want 3; steps = %v", len(steps), steps)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

// discardLogger returns a logger that throws away all output.
func discardLogger() *logger.Logger {
	return logger.NewDiscard()
}
