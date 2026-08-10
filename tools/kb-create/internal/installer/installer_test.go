package installer

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/config"
	"github.com/kb-labs/create/internal/logger"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
)

// ── fakes ────────────────────────────────────────────────────────────────────

// fakePM is a no-op package manager for use in tests.
type fakePM struct {
	failErr  error
	name     string
	registry string
	failOn   string
	calls    []string
}

func (f *fakePM) Name() string        { return f.name }
func (f *fakePM) RegistryURL() string { return f.registry }

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

func (f *fakePM) Restore(dir string, ch chan<- pm.Progress) error {
	f.calls = append(f.calls, "restore")
	return f.failErr
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

// ── selectedPkgSpecs (version overrides) ──────────────────────────────────────

func TestSelectedPkgSpecs_NoOverrideUsesLatest(t *testing.T) {
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	m := sampleManifest()

	got := ins.selectedPkgSpecs(m.Plugins, []string{"mind"}, nil)
	want := []string{"@kb-labs/mind@latest"}
	if len(got) != 1 || got[0] != want[0] {
		t.Errorf("selectedPkgSpecs = %v, want %v", got, want)
	}
}

func TestSelectedPkgSpecs_VersionOverrideApplied(t *testing.T) {
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	m := sampleManifest()

	got := ins.selectedPkgSpecs(m.Plugins, []string{"mind"}, map[string]string{"mind": "0.2.0"})
	want := []string{"@kb-labs/mind@0.2.0"}
	if len(got) != 1 || got[0] != want[0] {
		t.Errorf("selectedPkgSpecs = %v, want %v", got, want)
	}
}

func TestSelectedPkgSpecs_OverrideIgnoredForLocalPath(t *testing.T) {
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	m := manifest.Manifest{
		Plugins: []manifest.Component{{ID: "mind", Pkg: "@kb-labs/mind", LocalPath: "/dev/mind"}},
	}

	got := ins.selectedPkgSpecs(m.Plugins, []string{"mind"}, map[string]string{"mind": "0.2.0"})
	want := []string{"@kb-labs/mind@file:/dev/mind"}
	if len(got) != 1 || got[0] != want[0] {
		t.Errorf("selectedPkgSpecs = %v, want %v (a version pin must not override a dev-mode local path)", got, want)
	}
}

func TestSelectedPkgSpecs_OverrideOnlyAppliesToMatchingID(t *testing.T) {
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	m := sampleManifest()

	got := ins.selectedPkgSpecs(m.Plugins, []string{"mind", "agents"}, map[string]string{"mind": "0.2.0"})
	want := []string{"@kb-labs/mind@0.2.0", "@kb-labs/agents@latest"}
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("selectedPkgSpecs = %v, want %v", got, want)
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
	cfg := config.NewConfig(dir, dir, "npm", "", "", &installed, config.TelemetryConfig{})
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
	cfg := config.NewConfig(dir, dir, "npm", "", "", &installed, config.TelemetryConfig{})
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
	cfg := config.NewConfig(dir, dir, "npm", "", "", &m, config.TelemetryConfig{})
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
	cfg := config.NewConfig(dir, dir, "npm", "", "", &m, config.TelemetryConfig{})
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

	// Both core packages must appear in install calls (with @latest spec).
	seen := make(map[string]bool)
	for _, c := range fake.calls {
		seen[c] = true
	}
	for _, spec := range m.CorePackageSpecs() {
		if !seen["install:"+spec] {
			t.Errorf("core package %q not installed; calls = %v", spec, fake.calls)
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

func TestFinalizeDeclarativeWritesDiscoveredGatewayPlan(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	writeFakeService(t, platformDir, "rest", 5050)

	m := manifest.Manifest{
		Services: []manifest.Component{{
			ID:            "rest",
			Pkg:           "@kb-labs/rest-api",
			GatewayPrefix: "/api/v1",
		}},
	}
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	if _, err := ins.FinalizeDeclarative(&Selection{
		PlatformDir: platformDir,
		ProjectCWD:  projectDir,
		Services:    []string{"rest"},
	}, &m); err != nil {
		t.Fatalf("FinalizeDeclarative() error = %v", err)
	}

	data, err := os.ReadFile(filepath.Join(platformDir, ".kb", "kb.config.jsonc"))
	if err != nil {
		t.Fatalf("read platform config: %v", err)
	}
	configText := string(data)
	for _, want := range []string{"\"rest\"", "\"/api/v1\"", "\"http://127.0.0.1:5050\""} {
		if !strings.Contains(configText, want) {
			t.Errorf("platform config missing %s:\n%s", want, configText)
		}
	}
}

func TestFinalizeDeclarativeWritesCatalogPluginBlocks(t *testing.T) {
	platformDir := t.TempDir()
	m := manifest.Manifest{
		Plugins: []manifest.Component{{
			ID:  "release",
			Pkg: "@kb-labs/release-manager-cli",
		}},
	}
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	if _, err := ins.FinalizeDeclarative(&Selection{
		PlatformDir: platformDir,
		Plugins:     []string{"release"},
	}, &m); err != nil {
		t.Fatalf("FinalizeDeclarative() error = %v", err)
	}

	data, err := os.ReadFile(filepath.Join(platformDir, ".kb", "kb.config.jsonc"))
	if err != nil {
		t.Fatalf("read platform config: %v", err)
	}
	configText := string(data)
	if !strings.Contains(configText, `"release": {`) || !strings.Contains(configText, `"enabled": true`) {
		t.Fatalf("platform config missing enabled release plugin block:\n%s", configText)
	}
}

func TestFinalizeDeclarativeLocalModeDisablesGatewayAuth(t *testing.T) {
	platformDir := t.TempDir()
	m := manifest.Manifest{}
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	if _, err := ins.FinalizeDeclarative(&Selection{
		PlatformDir: platformDir,
		LocalMode:   true,
	}, &m); err != nil {
		t.Fatalf("FinalizeDeclarative() error = %v", err)
	}

	data, err := os.ReadFile(filepath.Join(platformDir, ".kb", "kb.config.jsonc"))
	if err != nil {
		t.Fatalf("read platform config: %v", err)
	}
	configText := string(data)
	if !strings.Contains(configText, `"auth": { "enabled": false }`) {
		t.Fatalf("local platform config must disable gateway auth:\n%s", configText)
	}
	if !strings.Contains(configText, `"host": "127.0.0.1"`) {
		t.Fatalf("local platform config must bind gateway to loopback:\n%s", configText)
	}
}

// ── provenance ────────────────────────────────────────────────────────────────

// TestInstallWritesSourceProvenance verifies that Install persists the registry
// URL and installer version into PlatformConfig.Source.
func TestInstallWritesSourceProvenance(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	fake := &fakePM{name: "npm", registry: "http://localhost:4873"}
	ins := &Installer{PM: fake, Log: discardLogger(), Version: "1.5.0"}
	m := sampleManifest()
	sel := &Selection{PlatformDir: platformDir, ProjectCWD: projectDir}

	if _, err := ins.Install(sel, &m); err != nil {
		t.Fatalf("Install() error = %v", err)
	}

	cfg, err := config.Read(platformDir)
	if err != nil {
		t.Fatalf("config.Read() error = %v", err)
	}

	if cfg.Source.Registry != "http://localhost:4873" {
		t.Errorf("Source.Registry = %q, want %q", cfg.Source.Registry, "http://localhost:4873")
	}
	if cfg.Source.InstalledBy != "kb-create@1.5.0" {
		t.Errorf("Source.InstalledBy = %q, want %q", cfg.Source.InstalledBy, "kb-create@1.5.0")
	}
	if cfg.Source.InstalledAt.IsZero() {
		t.Error("Source.InstalledAt is zero")
	}
}

// TestUpdateWritesProvenance verifies that Update fills UpdatedAt, UpdatedBy,
// and updates Source.Registry when the pm has a custom registry set.
func TestUpdateWritesProvenance(t *testing.T) {
	dir := t.TempDir()

	installed := manifest.Manifest{
		Version: "1.0.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
	}
	cfg := config.NewConfig(dir, dir, "npm", "", "", &installed, config.TelemetryConfig{})
	if err := config.Write(dir, cfg); err != nil {
		t.Fatalf("config.Write() error = %v", err)
	}

	current := manifest.Manifest{
		Version: "1.1.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
	}

	fake := &fakePM{name: "npm", registry: "http://localhost:4873"}
	ins := &Installer{PM: fake, Log: discardLogger(), Version: "1.6.0"}

	if _, err := ins.Update(dir, &current); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	got, err := config.Read(dir)
	if err != nil {
		t.Fatalf("config.Read() after Update error = %v", err)
	}

	if got.UpdatedAt.IsZero() {
		t.Error("UpdatedAt is zero after Update()")
	}
	if got.UpdatedBy != "kb-create@1.6.0" {
		t.Errorf("UpdatedBy = %q, want %q", got.UpdatedBy, "kb-create@1.6.0")
	}
	if got.Source.Registry != "http://localhost:4873" {
		t.Errorf("Source.Registry = %q, want %q", got.Source.Registry, "http://localhost:4873")
	}
}

func TestUpdateGroupUsesConfiguredPackageTag(t *testing.T) {
	t.Setenv("KB_CREATE_PACKAGE_TAG", "canary")
	fake := &fakePM{name: "pnpm"}
	ins := &Installer{PM: fake, Log: discardLogger()}

	if err := ins.updateGroup(t.TempDir(), []string{"@kb-labs/sdk"}); err != nil {
		t.Fatalf("updateGroup() error = %v", err)
	}
	if len(fake.calls) != 1 || fake.calls[0] != "update:@kb-labs/sdk@canary" {
		t.Fatalf("update calls = %v, want [update:@kb-labs/sdk@canary]", fake.calls)
	}
}

// TestUpdatePreservesSourceRegistryWhenNoRegistry verifies that Update does
// not overwrite Source.Registry when the pm has no custom registry set
// (the original install registry must be preserved).
func TestUpdatePreservesSourceRegistryWhenNoRegistry(t *testing.T) {
	dir := t.TempDir()

	installed := manifest.Manifest{
		Version: "1.0.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
	}
	cfg := config.NewConfig(dir, dir, "npm", "http://localhost:4873", "kb-create@1.0.0", &installed, config.TelemetryConfig{})
	if err := config.Write(dir, cfg); err != nil {
		t.Fatalf("config.Write() error = %v", err)
	}

	current := manifest.Manifest{
		Version: "1.1.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
	}

	// Update without a custom registry — original Source.Registry must survive.
	ins := &Installer{PM: &fakePM{name: "npm"}, Log: discardLogger()}
	if _, err := ins.Update(dir, &current); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	got, err := config.Read(dir)
	if err != nil {
		t.Fatalf("config.Read() after Update error = %v", err)
	}

	if got.Source.Registry != "http://localhost:4873" {
		t.Errorf("Source.Registry changed unexpectedly: got %q, want %q", got.Source.Registry, "http://localhost:4873")
	}
}

// ── negative paths (installation-flow.md hard/soft-fail branches) ───────────

// TestInstall_PMInstallErrorHardFails verifies that a package manager error
// (e.g. network/registry unreachable) aborts Install entirely — the hard-fail
// branch ("L1x: Hard fail, telemetry: install_failed") in installation-flow.md.
// cmd/create.go turns this error into "installation failed: %w" and a
// non-zero process exit; here we assert the contract at the Installer level.
func TestInstall_PMInstallErrorHardFails(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	wantErr := errors.New("registry unreachable: ETIMEDOUT")
	fake := &fakePM{
		name:    "npm",
		failOn:  "@kb-labs/cli-bin@latest", // first core package spec
		failErr: wantErr,
	}
	ins := &Installer{PM: fake, Log: discardLogger()}
	m := sampleManifest()
	sel := &Selection{PlatformDir: platformDir, ProjectCWD: projectDir}

	result, err := ins.Install(sel, &m)
	if err == nil {
		t.Fatalf("Install() error = nil, want error wrapping %v", wantErr)
	}
	if !errors.Is(err, wantErr) {
		t.Errorf("Install() error = %v, want it to wrap %v", err, wantErr)
	}
	if result != nil {
		t.Errorf("Install() result = %+v, want nil on hard failure", result)
	}

	// No config should have been written — the failure happens before Step 3.
	if _, readErr := config.Read(platformDir); readErr == nil {
		t.Error("config.Read() succeeded after a hard PM.Install failure — config must not be written")
	}
}

// TestInstall_BinaryDownloadFailureHardFails verifies that the required
// service-manager binary is part of the installation contract. A failed
// binary install must not leave a successful-looking partial platform behind.
func TestInstall_BinaryDownloadFailureHardFails(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	fake := &fakePM{name: "npm"}
	ins := &Installer{
		PM:  fake,
		Log: discardLogger(),
	}
	// Force platform.CopyBinary to fail deterministically: it needs to
	// os.MkdirAll(platformDir+"/bin", ...) before writing, and MkdirAll
	// errors when a path component already exists as a regular file. A
	// missing/dangling LocalPath target would NOT fail here — Unix symlinks
	// don't validate their target exists, so that alone wouldn't reproduce
	// the failure this test is meant to exercise.
	if err := os.WriteFile(filepath.Join(platformDir, "bin"), []byte("not a directory"), 0o600); err != nil {
		t.Fatalf("seed conflicting file: %v", err)
	}

	m := sampleManifest()
	m.Binaries = []manifest.Binary{
		{ID: "kb-dev", Name: "kb-dev", LocalPath: filepath.Join(t.TempDir(), "kb-dev-stub")},
	}
	sel := &Selection{PlatformDir: platformDir, ProjectCWD: projectDir}

	result, err := ins.Install(sel, &m)
	if err == nil {
		t.Fatal("Install() error = nil, want required binary failure")
	}
	if result != nil {
		t.Fatalf("Install() result = %+v, want nil on required binary failure", result)
	}
	if !strings.Contains(err.Error(), "install required binaries") {
		t.Errorf("Install() error = %v, want required-binary context", err)
	}
	if _, readErr := config.Read(platformDir); readErr == nil {
		t.Error("config.Read() succeeded after required binary failure — partial install must not be reported as complete")
	}
}

// TestInstall_ScanErrorSoftContinues verifies the soft-fail branch
// ("L3x: Warn, continue without marketplace.lock / devservices.yaml") — the
// manifest scanner shells out to `node`; with no `node` on PATH it fails,
// and Install() must log a WARN and still return a successful Result rather
// than aborting the whole install.
func TestInstall_ScanErrorSoftContinues(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	// Remove `node` from PATH (and everything else) so scan.Run's
	// `exec.CommandContext(ctx, "node", ...)` fails deterministically,
	// without touching the real filesystem or network.
	t.Setenv("PATH", t.TempDir())

	var lines []string
	fake := &fakePM{name: "npm"}
	ins := &Installer{
		PM:  fake,
		Log: discardLogger(),
		OnLine: func(line string) {
			lines = append(lines, line)
		},
	}
	m := sampleManifest()
	sel := &Selection{PlatformDir: platformDir, ProjectCWD: projectDir}

	result, err := ins.Install(sel, &m)
	if err != nil {
		t.Fatalf("Install() error = %v, want nil (scan failure must be soft)", err)
	}
	if result == nil {
		t.Fatal("Install() result = nil, want a Result on soft-fail continuation")
	}
	if result.HasServices {
		t.Error("Result.HasServices = true, want false when scan failed")
	}

	found := false
	for _, l := range lines {
		if strings.Contains(l, "WARN: manifest scan:") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected a WARN line about manifest scan failure, got lines: %v", lines)
	}

	// The rest of the install must have completed despite the scan failure.
	if _, err := config.Read(platformDir); err != nil {
		t.Errorf("config.Read() after soft scan failure = %v, want config to still be written", err)
	}
}

// TestInstall_ScanErrorWithServicesSelectedSetsWarning guards against a
// regression where kb-dev start on a fresh install failed with "no config
// found ... create .kb/devservices.yaml" and the user had no idea why: a
// failed manifest scan silently skipped writing devservices.yaml (previous
// test), logged only via ins.OnLine (easy to miss in the spinner detail
// line), and Result carried no signal a caller could act on. When the user
// actually selected services, Result.ServicesWarning must be populated so
// cmd/create.go can print it prominently instead of burying it.
func TestInstall_ScanErrorWithServicesSelectedSetsWarning(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()

	t.Setenv("PATH", t.TempDir())

	fake := &fakePM{name: "npm"}
	ins := &Installer{
		PM:  fake,
		Log: discardLogger(),
	}
	m := sampleManifest()
	sel := &Selection{PlatformDir: platformDir, ProjectCWD: projectDir, Services: []string{"rest"}}

	result, err := ins.Install(sel, &m)
	if err != nil {
		t.Fatalf("Install() error = %v, want nil (scan failure must be soft)", err)
	}
	if result.ServicesWarning == "" {
		t.Error("Result.ServicesWarning = \"\", want a non-empty warning when services were selected but the scan failed")
	}
	if !strings.Contains(result.ServicesWarning, "kb-create update") {
		t.Errorf("Result.ServicesWarning = %q, want it to mention `kb-create update` as the recovery step", result.ServicesWarning)
	}
}

// TestInstallPopulatesInstalledPlugins verifies that Result.InstalledPlugins
// carries the manifest scan's plugin entries through, so callers (e.g.
// `kb-create install`'s env-var hints) can inspect each plugin's static
// dist/manifest.json without re-scanning node_modules themselves.
func TestInstallPopulatesInstalledPlugins(t *testing.T) {
	platformDir := t.TempDir()
	projectDir := t.TempDir()
	writeFakePlugin(t, platformDir, "@test/my-plugin")

	fake := &fakePM{name: "npm"}
	ins := &Installer{PM: fake, Log: discardLogger()}
	m := sampleManifest()

	sel := &Selection{
		PlatformDir: platformDir,
		ProjectCWD:  projectDir,
		Plugins:     []string{"mind"},
	}

	result, err := ins.Install(sel, &m)
	if err != nil {
		t.Fatalf("Install() error = %v", err)
	}

	var found bool
	for _, p := range result.InstalledPlugins {
		if p.ID == "@test/my-plugin" {
			found = true
		}
	}
	if !found {
		t.Errorf("Result.InstalledPlugins = %+v, want an entry for @test/my-plugin", result.InstalledPlugins)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

// discardLogger returns a logger that throws away all output.
func discardLogger() *logger.Logger {
	return logger.NewDiscard()
}

// writeFakePlugin creates a minimal kb.plugin/3 package under
// <platformDir>/node_modules so the real Node-based manifest scanner
// (internal/scan) discovers it during Install(), mirroring
// internal/scan/scan_test.go's setupFakePlatform fixture shape.
func writeFakePlugin(t *testing.T, platformDir, id string) {
	t.Helper()
	pluginDir := filepath.Join(platformDir, "node_modules", filepath.FromSlash(id))
	pkgJSON := []byte(`{"name":"` + id + `","version":"1.0.0","kb":{"manifest":"./dist/manifest.js"}}`)
	if err := os.MkdirAll(pluginDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pluginDir, "package.json"), pkgJSON, 0o600); err != nil {
		t.Fatal(err)
	}
	manifestJS := `module.exports.manifest = {
		schema: "kb.plugin/3",
		id: "` + id + `",
		version: "1.0.0",
		display: { name: "Test Plugin", description: "Fixture" },
		cli: { commands: [] },
	};`
	distDir := filepath.Join(pluginDir, "dist")
	if err := os.MkdirAll(distDir, 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "manifest.js"), []byte(manifestJS), 0o600); err != nil {
		t.Fatal(err)
	}
}

func writeFakeService(t *testing.T, platformDir, id string, port int) {
	t.Helper()
	serviceDir := filepath.Join(platformDir, "node_modules", "@kb-labs", id+"-app")
	if err := os.MkdirAll(filepath.Join(serviceDir, "dist"), 0o750); err != nil {
		t.Fatal(err)
	}
	pkgJSON := `{"name":"@kb-labs/` + id + `-app","version":"1.0.0","kb":{"manifest":"./dist/manifest.js"}}`
	if err := os.WriteFile(filepath.Join(serviceDir, "package.json"), []byte(pkgJSON), 0o600); err != nil {
		t.Fatal(err)
	}
	manifestJS := `module.exports.manifest = {
		schema: "kb.service/1",
		id: "` + id + `",
		name: "Test service",
		runtime: { entry: "dist/index.js", port: ` + fmt.Sprint(port) + `, healthCheck: "/health" }
	};`
	if err := os.WriteFile(filepath.Join(serviceDir, "dist", "manifest.js"), []byte(manifestJS), 0o600); err != nil {
		t.Fatal(err)
	}
}
