package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kb-labs/create/internal/manifest"
)

func sampleManifest() manifest.Manifest {
	return manifest.Manifest{
		Version: "1.0.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
		Services: []manifest.Component{
			{ID: "rest", Pkg: "@kb-labs/rest-api", Description: "REST API", Default: true},
		},
		Plugins: []manifest.Component{
			{ID: "mind", Pkg: "@kb-labs/mind", Description: "RAG", Default: true},
		},
	}
}

// TestNewConfig verifies that NewConfig populates all required fields.
func TestNewConfig(t *testing.T) {
	m := sampleManifest()
	cfg := NewConfig("/tmp/platform", "/tmp/project", "pnpm", "", "", &m, TelemetryConfig{Enabled: true, DeviceID: "test-id"})

	if cfg.Version != configVersion {
		t.Errorf("Version = %d, want %d", cfg.Version, configVersion)
	}
	if cfg.PM != "pnpm" {
		t.Errorf("PM = %q, want %q", cfg.PM, "pnpm")
	}
	if cfg.InstalledAt.IsZero() {
		t.Error("InstalledAt is zero")
	}
	if cfg.Manifest.Version != "1.0.0" {
		t.Errorf("Manifest.Version = %q, want %q", cfg.Manifest.Version, "1.0.0")
	}
}

// TestWriteThenRead verifies round-trip write → read produces identical config.
func TestWriteThenRead(t *testing.T) {
	dir := t.TempDir()
	m := sampleManifest()
	want := NewConfig(dir, "/some/project", "npm", "", "", &m, TelemetryConfig{Enabled: true, DeviceID: "abc123"})
	// Fix timestamp for deterministic comparison.
	want.InstalledAt = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	if err := Write(dir, want); err != nil {
		t.Fatalf("Write() error = %v", err)
	}

	got, err := Read(dir)
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}

	if got.Version != want.Version {
		t.Errorf("Version: got %d, want %d", got.Version, want.Version)
	}
	if got.PM != want.PM {
		t.Errorf("PM: got %q, want %q", got.PM, want.PM)
	}
	if !got.InstalledAt.Equal(want.InstalledAt) {
		t.Errorf("InstalledAt: got %v, want %v", got.InstalledAt, want.InstalledAt)
	}
	if got.Manifest.Version != want.Manifest.Version {
		t.Errorf("Manifest.Version: got %q, want %q", got.Manifest.Version, want.Manifest.Version)
	}
	if len(got.Manifest.Core) != len(want.Manifest.Core) {
		t.Errorf("Core len: got %d, want %d", len(got.Manifest.Core), len(want.Manifest.Core))
	}
}

// TestReadMissing verifies that reading a non-existent config returns an error.
func TestReadMissing(t *testing.T) {
	dir := t.TempDir()
	_, err := Read(dir)
	if err == nil {
		t.Error("Read() on missing config should return error, got nil")
	}
}

// TestConfigPath verifies the expected config file path.
func TestConfigPath(t *testing.T) {
	base := t.TempDir()
	got := ConfigPath(base)
	want := filepath.Join(base, configDir, configFile)
	if got != want {
		t.Errorf("ConfigPath = %q, want %q", got, want)
	}
}

// TestIsServiceSelected verifies selection lookup.
func TestIsServiceSelected(t *testing.T) {
	m := sampleManifest()
	cfg := NewConfig("/tmp/p", "/tmp/c", "pnpm", "", "", &m, TelemetryConfig{})
	cfg.SelectedServices = []string{"rest"}

	if !cfg.IsServiceSelected("rest") {
		t.Error("IsServiceSelected(rest) = false, want true")
	}
	if cfg.IsServiceSelected("studio") {
		t.Error("IsServiceSelected(studio) = true, want false")
	}
}

// TestIsPluginSelected verifies selection lookup.
func TestIsPluginSelected(t *testing.T) {
	m := sampleManifest()
	cfg := NewConfig("/tmp/p", "/tmp/c", "pnpm", "", "", &m, TelemetryConfig{})
	cfg.SelectedPlugins = []string{"mind"}

	if !cfg.IsPluginSelected("mind") {
		t.Error("IsPluginSelected(mind) = false, want true")
	}
	if cfg.IsPluginSelected("agents") {
		t.Error("IsPluginSelected(agents) = true, want false")
	}
}

// TestInstalledPackageNames returns core + selected, not all.
func TestInstalledPackageNames(t *testing.T) {
	m := manifest.Manifest{
		Version: "1.0.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
		Services: []manifest.Component{
			{ID: "rest", Pkg: "@kb-labs/rest-api", Default: true},
			{ID: "studio", Pkg: "@kb-labs/studio", Default: false},
		},
		Plugins: []manifest.Component{
			{ID: "mind", Pkg: "@kb-labs/mind", Default: true},
			{ID: "agents", Pkg: "@kb-labs/agents", Default: false},
		},
	}
	cfg := NewConfig("/tmp/p", "/tmp/c", "pnpm", "", "", &m, TelemetryConfig{})
	cfg.SelectedServices = []string{"rest"}
	cfg.SelectedPlugins = []string{"mind"}

	got := cfg.InstalledPackageNames()
	want := map[string]bool{
		"@kb-labs/cli-bin":  true,
		"@kb-labs/rest-api": true,
		"@kb-labs/mind":     true,
	}
	if len(got) != len(want) {
		t.Fatalf("InstalledPackageNames len = %d, want %d; got %v", len(got), len(want), got)
	}
	for _, pkg := range got {
		if !want[pkg] {
			t.Errorf("unexpected package %q in InstalledPackageNames", pkg)
		}
	}
}

// TestInstalledPackageNamesEmpty returns only core when nothing selected.
func TestInstalledPackageNamesEmpty(t *testing.T) {
	m := sampleManifest()
	cfg := NewConfig("/tmp/p", "/tmp/c", "pnpm", "", "", &m, TelemetryConfig{})
	// no SelectedServices or SelectedPlugins

	got := cfg.InstalledPackageNames()
	if len(got) != 1 || got[0] != "@kb-labs/cli-bin" {
		t.Errorf("InstalledPackageNames with no selection = %v, want [@kb-labs/cli-bin]", got)
	}
}

// TestSelectionRoundTrip verifies that selections survive write → read.
func TestSelectionRoundTrip(t *testing.T) {
	dir := t.TempDir()
	m := sampleManifest()
	cfg := NewConfig(dir, dir, "pnpm", "", "", &m, TelemetryConfig{})
	cfg.SelectedServices = []string{"rest"}
	cfg.SelectedPlugins = []string{"mind"}

	if err := Write(dir, cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}

	got, err := Read(dir)
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}

	if len(got.SelectedServices) != 1 || got.SelectedServices[0] != "rest" {
		t.Errorf("SelectedServices = %v, want [rest]", got.SelectedServices)
	}
	if len(got.SelectedPlugins) != 1 || got.SelectedPlugins[0] != "mind" {
		t.Errorf("SelectedPlugins = %v, want [mind]", got.SelectedPlugins)
	}
}

// TestWriteCreatesDirectory verifies that Write creates .kb/ if it does not exist.
func TestWriteCreatesDirectory(t *testing.T) {
	dir := t.TempDir()
	// Remove any pre-existing .kb directory.
	_ = os.RemoveAll(filepath.Join(dir, ".kb"))

	m := sampleManifest()
	cfg := NewConfig(dir, dir, "npm", "", "", &m, TelemetryConfig{})
	if err := Write(dir, cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}

	if _, err := os.Stat(ConfigPath(dir)); err != nil {
		t.Errorf("config file not created: %v", err)
	}
}

// ── InstallSource ─────────────────────────────────────────────────────────────

// TestNewConfigPopulatesSource verifies that NewConfig fills Source with the
// registry URL, installedBy string, and a non-zero InstalledAt timestamp.
func TestNewConfigPopulatesSource(t *testing.T) {
	m := sampleManifest()
	cfg := NewConfig("/tmp/p", "/tmp/c", "pnpm", "http://localhost:4873", "kb-create@1.5.0", &m, TelemetryConfig{})

	if cfg.Source.Registry != "http://localhost:4873" {
		t.Errorf("Source.Registry = %q, want %q", cfg.Source.Registry, "http://localhost:4873")
	}
	if cfg.Source.InstalledBy != "kb-create@1.5.0" {
		t.Errorf("Source.InstalledBy = %q, want %q", cfg.Source.InstalledBy, "kb-create@1.5.0")
	}
	if cfg.Source.InstalledAt.IsZero() {
		t.Error("Source.InstalledAt is zero")
	}
	// InstalledAt on Source should match the top-level InstalledAt.
	if !cfg.Source.InstalledAt.Equal(cfg.InstalledAt) {
		t.Errorf("Source.InstalledAt %v != InstalledAt %v", cfg.Source.InstalledAt, cfg.InstalledAt)
	}
}

// TestNewConfigEmptyProvenanceFields verifies that empty registry/installedBy
// are stored as-is (no default injection at this layer).
func TestNewConfigEmptyProvenanceFields(t *testing.T) {
	m := sampleManifest()
	cfg := NewConfig("/tmp/p", "/tmp/c", "npm", "", "", &m, TelemetryConfig{})

	if cfg.Source.Registry != "" {
		t.Errorf("Source.Registry = %q, want empty", cfg.Source.Registry)
	}
	if cfg.Source.InstalledBy != "" {
		t.Errorf("Source.InstalledBy = %q, want empty", cfg.Source.InstalledBy)
	}
}

// TestEffectiveRegistryFallback verifies that EffectiveRegistry returns the
// npm default when Registry is empty.
func TestEffectiveRegistryFallback(t *testing.T) {
	s := InstallSource{}
	if got := s.EffectiveRegistry(); got != "https://registry.npmjs.org/" {
		t.Errorf("EffectiveRegistry() = %q, want default npm registry", got)
	}
}

// TestEffectiveRegistryCustom verifies that a set Registry is returned as-is.
func TestEffectiveRegistryCustom(t *testing.T) {
	s := InstallSource{Registry: "http://localhost:4873"}
	if got := s.EffectiveRegistry(); got != "http://localhost:4873" {
		t.Errorf("EffectiveRegistry() = %q, want %q", got, "http://localhost:4873")
	}
}

// TestSourceRoundTrip verifies that Source fields survive Write → Read.
func TestSourceRoundTrip(t *testing.T) {
	dir := t.TempDir()
	m := sampleManifest()
	cfg := NewConfig(dir, dir, "pnpm", "http://localhost:4873", "kb-create@2.0.0", &m, TelemetryConfig{})

	if err := Write(dir, cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	got, err := Read(dir)
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}

	if got.Source.Registry != "http://localhost:4873" {
		t.Errorf("Source.Registry after round-trip = %q, want %q", got.Source.Registry, "http://localhost:4873")
	}
	if got.Source.InstalledBy != "kb-create@2.0.0" {
		t.Errorf("Source.InstalledBy after round-trip = %q, want %q", got.Source.InstalledBy, "kb-create@2.0.0")
	}
}
