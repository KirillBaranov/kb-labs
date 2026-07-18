package wizard

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/mattn/go-isatty"

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

// ── LLM provider wizard step (B-001 replacement) ─────────────────────────────

// TestToSelectionLLMProviderOpenAI verifies that when the user picks openai
// and enters a key, toSelection() propagates LLMProvider and LLMKey.
// Before the fix these fields did not exist; after the fix they are set.
func TestToSelectionLLMProviderOpenAI(t *testing.T) {
	m := wizardModel{
		platformInput: makeInput("/platform"),
		cwdInput:      makeInput("/project"),
		llmProvider:   "openai",
		llmKeyInput:   makeInput("sk-test-key-123"),
	}

	sel := m.toSelection()

	if sel.LLMProvider != "openai" {
		t.Errorf("LLMProvider = %q, want openai", sel.LLMProvider)
	}
	if sel.LLMKey != "sk-test-key-123" {
		t.Errorf("LLMKey = %q, want sk-test-key-123", sel.LLMKey)
	}
}

// TestToSelectionLLMProviderSkip verifies that skipping LLM sets empty
// LLMProvider and LLMKey — no credentials written to .env.
func TestToSelectionLLMProviderSkip(t *testing.T) {
	m := wizardModel{
		platformInput: makeInput("/platform"),
		cwdInput:      makeInput("/project"),
		llmProvider:   "",
	}

	sel := m.toSelection()

	if sel.LLMProvider != "" {
		t.Errorf("LLMProvider = %q, want empty (skipped)", sel.LLMProvider)
	}
	if sel.LLMKey != "" {
		t.Errorf("LLMKey = %q, want empty (skipped)", sel.LLMKey)
	}
}

// ── Studio access mode (B-023) ───────────────────────────────────────────────

// TestToSelectionStudioSecuredDefault verifies that the default (Secured) leaves
// LocalMode false — auth stays on, the safe default for any install.
func TestToSelectionStudioSecuredDefault(t *testing.T) {
	m := wizardModel{
		platformInput: makeInput("/platform"),
		cwdInput:      makeInput("/project"),
		localMode:     false, // Secured (studioCursor 0)
	}
	if sel := m.toSelection(); sel.LocalMode {
		t.Errorf("LocalMode = true, want false (Secured is the default)")
	}
}

// TestToSelectionStudioLocal verifies that choosing Local single-user mode sets
// LocalMode, which create.go turns into gateway auth-off + loopback bind.
func TestToSelectionStudioLocal(t *testing.T) {
	m := wizardModel{
		platformInput: makeInput("/platform"),
		cwdInput:      makeInput("/project"),
		localMode:     true, // Local (studioCursor 1)
	}
	if sel := m.toSelection(); !sel.LocalMode {
		t.Errorf("LocalMode = false, want true (user chose Local)")
	}
}

// TestHandleStudioKeySelectsLocal verifies the Studio stage maps cursor → localMode.
func TestHandleStudioKeySelectsLocal(t *testing.T) {
	m := wizardModel{stage: stageStudio, studioCursor: 1} // Local highlighted
	next, _ := m.handleStudioKey(tea.KeyMsg{Type: tea.KeyEnter})
	got := next.(wizardModel)
	if !got.localMode {
		t.Errorf("localMode = false after selecting Local, want true")
	}
	if got.stage != stageConfirm {
		t.Errorf("stage = %v after Studio selection, want stageConfirm", got.stage)
	}
}

// ── Confirm stage: cancel vs confirm (installation-flow.md "F6 -- cancel") ──

// TestHandleConfirmKeyCancels verifies that esc/n/N/ctrl+c at the confirm
// stage sets cancelled=true and quits the program. wizard.Run turns this
// into the "installation cancelled" error (wizard.go Run(), result.cancelled
// branch) — nothing gets written to disk.
func TestHandleConfirmKeyCancels(t *testing.T) {
	for _, tc := range []struct {
		name string
		msg  tea.KeyMsg
	}{
		{"esc", tea.KeyMsg{Type: tea.KeyEsc}},
		{"ctrl+c", tea.KeyMsg{Type: tea.KeyCtrlC}},
		{"n", tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("n")}},
		{"N", tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("N")}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m := wizardModel{stage: stageConfirm}
			next, cmd := m.handleConfirmKey(tc.msg)
			got := next.(wizardModel)
			if !got.cancelled {
				t.Errorf("handleConfirmKey(%s): cancelled = false, want true", tc.name)
			}
			if cmd == nil {
				t.Errorf("handleConfirmKey(%s): expected tea.Quit cmd, got nil", tc.name)
			}
		})
	}
}

// TestHandleConfirmKeyConfirms verifies that enter/y/Y at the confirm stage
// quits the program WITHOUT setting cancelled — the install proceeds.
func TestHandleConfirmKeyConfirms(t *testing.T) {
	for _, tc := range []struct {
		name string
		msg  tea.KeyMsg
	}{
		{"enter", tea.KeyMsg{Type: tea.KeyEnter}},
		{"y", tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("y")}},
		{"Y", tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("Y")}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m := wizardModel{stage: stageConfirm}
			next, cmd := m.handleConfirmKey(tc.msg)
			got := next.(wizardModel)
			if got.cancelled {
				t.Errorf("handleConfirmKey(%s): cancelled = true, want false", tc.name)
			}
			if cmd == nil {
				t.Errorf("handleConfirmKey(%s): expected tea.Quit cmd, got nil", tc.name)
			}
		})
	}
}

// ── Run(): no TTY + no --yes → abort (installation-flow.md "E1: Abort: run with --yes") ──

// TestRunNoTTYAbortsWithoutYes verifies that Run() refuses to launch the
// interactive wizard when stdin isn't a terminal and --yes wasn't passed —
// it must return an error mentioning --yes rather than hang or panic trying
// to drive a TUI against a non-tty stdin. Under `go test`, os.Stdin is
// never a real terminal, so this exercises the exact branch a CI-piped or
// scripted invocation of kb-create would hit.
func TestRunNoTTYAbortsWithoutYes(t *testing.T) {
	if isatty.IsTerminal(os.Stdin.Fd()) || isatty.IsCygwinTerminal(os.Stdin.Fd()) {
		t.Skip("test process stdin is a real TTY — can't exercise the no-TTY branch here")
	}

	m := sampleManifest()
	sel, err := Run(m, WizardOptions{Yes: false})
	if err == nil {
		t.Fatalf("Run() with no TTY and Yes=false should error, got selection %+v", sel)
	}
	if !strings.Contains(err.Error(), "--yes") {
		t.Errorf("Run() error = %q, want it to mention --yes", err.Error())
	}
	if sel != nil {
		t.Errorf("Run() selection = %+v, want nil on error", sel)
	}
}
