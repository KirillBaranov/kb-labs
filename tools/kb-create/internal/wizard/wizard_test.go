package wizard

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/charmbracelet/bubbles/textinput"

	"github.com/kb-labs/create/internal/manifest"
)

func makeInput(value string) textinput.Model {
	ti := textinput.New()
	ti.SetValue(value)
	return ti
}

func sampleManifest() *manifest.Manifest {
	return &manifest.Manifest{
		Version: "1.0.0",
		Core:    []manifest.Package{{Name: "@kb-labs/cli-bin"}},
		Services: []manifest.Component{
			{ID: "rest", Pkg: "@kb-labs/rest-api", Default: true},
			{ID: "studio", Pkg: "@kb-labs/studio", Default: true},
		},
		Plugins: []manifest.Component{
			{ID: "mind", Pkg: "@kb-labs/mind", Default: true},
			{ID: "agents", Pkg: "@kb-labs/agents", Default: true},
		},
	}
}

// ── defaultSelection (--yes mode = recommended preset) ──────────────────────

func TestDefaultSelectionInstallsEverything(t *testing.T) {
	m := sampleManifest()
	sel := defaultSelection(m, WizardOptions{})

	if len(sel.Services) != 2 {
		t.Errorf("Services = %v, want all 2", sel.Services)
	}
	if len(sel.Plugins) != 2 {
		t.Errorf("Plugins = %v, want all 2", sel.Plugins)
	}
}

func TestDefaultSelectionPlatformDirOverride(t *testing.T) {
	m := sampleManifest()
	sel := defaultSelection(m, WizardOptions{DefaultPlatformDir: "/custom/platform"})

	if sel.PlatformDir != "/custom/platform" {
		t.Errorf("PlatformDir = %q, want /custom/platform", sel.PlatformDir)
	}
}

func TestDefaultSelectionCWDOverride(t *testing.T) {
	m := sampleManifest()
	sel := defaultSelection(m, WizardOptions{DefaultProjectCWD: "/custom/project"})

	if sel.ProjectCWD != "/custom/project" {
		t.Errorf("ProjectCWD = %q, want /custom/project", sel.ProjectCWD)
	}
}

func TestDefaultSelectionFallsBackToHomeAndCWD(t *testing.T) {
	m := sampleManifest()
	sel := defaultSelection(m, WizardOptions{})

	home, _ := os.UserHomeDir()
	if !strings.HasPrefix(sel.PlatformDir, home) {
		t.Errorf("PlatformDir %q does not start with home %q", sel.PlatformDir, home)
	}
	cwd, _ := os.Getwd()
	if sel.ProjectCWD != cwd {
		t.Errorf("ProjectCWD = %q, want %q", sel.ProjectCWD, cwd)
	}
}

// ── Presets ──────────────────────────────────────────────────────────────────

func TestRecommendedPresetSelectsAll(t *testing.T) {
	m := sampleManifest()
	preset := AllPresets[0] // recommended
	if preset.ID != "recommended" {
		t.Fatalf("first preset ID = %q, want recommended", preset.ID)
	}

	svcs, plugs := resolvePreset(preset, m)
	if len(svcs) != 2 {
		t.Errorf("recommended services = %v, want all 2", svcs)
	}
	if len(plugs) != 2 {
		t.Errorf("recommended plugins = %v, want all 2", plugs)
	}
}

func TestMinimalPresetSelectsNothing(t *testing.T) {
	m := sampleManifest()
	var minimal Preset
	for _, p := range AllPresets {
		if p.ID == "minimal" {
			minimal = p
			break
		}
	}
	if minimal.ID == "" {
		t.Fatal("minimal preset not found")
	}

	svcs, plugs := resolvePreset(minimal, m)
	if len(svcs) != 0 {
		t.Errorf("minimal services = %v, want []", svcs)
	}
	if len(plugs) != 0 {
		t.Errorf("minimal plugins = %v, want []", plugs)
	}
}

func TestCustomPresetReturnsNil(t *testing.T) {
	m := sampleManifest()
	var custom Preset
	for _, p := range AllPresets {
		if p.ID == "custom" {
			custom = p
			break
		}
	}

	svcs, plugs := resolvePreset(custom, m)
	if svcs != nil || plugs != nil {
		t.Errorf("custom preset should return nil,nil; got %v, %v", svcs, plugs)
	}
}

// ── applySelection ──────────────────────────────────────────────────────────

func TestApplySelectionChecksCorrectItems(t *testing.T) {
	m := wizardModel{
		services: []checkItem{
			{id: "rest", checked: true},
			{id: "studio", checked: true},
		},
		plugins: []checkItem{
			{id: "mind", checked: true},
			{id: "agents", checked: true},
		},
	}

	m.applySelection([]string{"rest"}, []string{"mind"})

	if !m.services[0].checked || m.services[1].checked {
		t.Errorf("services: rest=%v studio=%v, want true/false",
			m.services[0].checked, m.services[1].checked)
	}
	if !m.plugins[0].checked || m.plugins[1].checked {
		t.Errorf("plugins: mind=%v agents=%v, want true/false",
			m.plugins[0].checked, m.plugins[1].checked)
	}
}

// ── toSelection ─────────────────────────────────────────────────────────────

func TestToSelectionCheckedItems(t *testing.T) {
	m := wizardModel{
		platformInput: makeInput("/platform"),
		cwdInput:      makeInput("/project"),
		services: []checkItem{
			{id: "rest", checked: true},
			{id: "studio", checked: false},
		},
		plugins: []checkItem{
			{id: "mind", checked: true},
			{id: "agents", checked: false},
		},
	}

	sel := m.toSelection()

	if len(sel.Services) != 1 || sel.Services[0] != "rest" {
		t.Errorf("Services = %v, want [rest]", sel.Services)
	}
	if len(sel.Plugins) != 1 || sel.Plugins[0] != "mind" {
		t.Errorf("Plugins = %v, want [mind]", sel.Plugins)
	}
}

func TestToSelectionAllChecked(t *testing.T) {
	m := wizardModel{
		platformInput: makeInput("/p"),
		cwdInput:      makeInput("/c"),
		services: []checkItem{
			{id: "rest", checked: true},
			{id: "studio", checked: true},
		},
		plugins: []checkItem{
			{id: "mind", checked: true},
			{id: "agents", checked: true},
		},
	}

	sel := m.toSelection()
	if len(sel.Services) != 2 {
		t.Errorf("Services len = %d, want 2", len(sel.Services))
	}
	if len(sel.Plugins) != 2 {
		t.Errorf("Plugins len = %d, want 2", len(sel.Plugins))
	}
}

// ── expandHome ──────────────────────────────────────────────────────────────

func TestExpandHomeTilde(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip("UserHomeDir unavailable:", err)
	}
	got := expandHome("~/projects/foo")
	want := filepath.Join(home, "projects", "foo")
	if got != want {
		t.Errorf("expandHome(~/projects/foo) = %q, want %q", got, want)
	}
}

func TestExpandHomeAbsolute(t *testing.T) {
	path := "/usr/local/bin"
	if got := expandHome(path); got != path {
		t.Errorf("expandHome(%q) = %q, want %q", path, got, path)
	}
}
