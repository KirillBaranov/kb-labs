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

// sampleManifest mirrors the shape of the real launch intents (explore /
// release / plugin-author / ai-review / custom) but reuses the sample's own
// component ids — the tests are about wizard mechanics, not production
// catalog content.
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
		Binaries: []manifest.Binary{
			{ID: "kb-dev", Name: "kb-dev", Default: true},
		},
		Intents: []manifest.Intent{
			{
				ID:          "explore",
				Label:       "Just look around",
				Description: "Install the full default set.",
				Bundle: manifest.IntentBundle{
					Services: []string{"rest", "studio"},
					Plugins:  []string{"mind", "agents"},
					Binaries: []string{"kb-dev"},
				},
			},
			{
				ID:          "release",
				Label:       "Automate releases",
				Description: "Just one plugin, no services.",
				Bundle: manifest.IntentBundle{
					Plugins: []string{"mind"},
				},
				FirstCommand: &manifest.FirstCommand{
					Command:   "kb release plan",
					Operation: manifest.CommandOperationAnalyze,
				},
				Steps: []manifest.IntentStep{
					{Type: stepEnvVar, Key: "NPM_TOKEN", Label: "npm publish token",
						Skippable: true, SkipHint: "add NPM_TOKEN later"},
				},
			},
			{
				ID:          "plugin-author",
				Label:       "Write my own plugin",
				Description: "No extra steps.",
				Bundle: manifest.IntentBundle{
					Services: []string{"rest"},
					Plugins:  []string{"agents"},
				},
			},
			{
				ID:          "ai-review",
				Label:       "Add AI review",
				Description: "One LLM step.",
				Bundle: manifest.IntentBundle{
					Plugins: []string{"mind"},
				},
				Steps: []manifest.IntentStep{{Type: stepLLMProvider}},
			},
			{
				ID:          "custom",
				Label:       "Choose exactly what I need",
				Description: "Pick yourself.",
				Bundle:      manifest.IntentBundle{},
				Steps: []manifest.IntentStep{
					{Type: stepLLMProvider},
					{Type: stepStudioAccess},
				},
			},
		},
	}
}

func intentIndex(m *manifest.Manifest, id string) int {
	for i, intent := range m.Intents {
		if intent.ID == id {
			return i
		}
	}
	return -1
}

// ── defaultSelection (--yes mode, optionally --intent=<id>) ─────────────────

func TestDefaultSelectionInstallsExploreByDefault(t *testing.T) {
	m := sampleManifest()
	sel, err := defaultSelection(m, WizardOptions{})
	if err != nil {
		t.Fatalf("defaultSelection() error = %v", err)
	}

	if len(sel.Services) != 2 {
		t.Errorf("Services = %v, want all 2", sel.Services)
	}
	if len(sel.Plugins) != 2 {
		t.Errorf("Plugins = %v, want all 2", sel.Plugins)
	}
	if len(sel.Binaries) != 1 {
		t.Errorf("Binaries = %v, want 1 (kb-dev)", sel.Binaries)
	}
	if sel.Intent != "explore" {
		t.Errorf("Intent = %q, want explore", sel.Intent)
	}
}

func TestDefaultSelectionPlatformDirOverride(t *testing.T) {
	m := sampleManifest()
	sel, err := defaultSelection(m, WizardOptions{DefaultPlatformDir: "/custom/platform"})
	if err != nil {
		t.Fatalf("defaultSelection() error = %v", err)
	}
	if sel.PlatformDir != "/custom/platform" {
		t.Errorf("PlatformDir = %q, want /custom/platform", sel.PlatformDir)
	}
}

func TestDefaultSelectionCWDOverride(t *testing.T) {
	m := sampleManifest()
	sel, err := defaultSelection(m, WizardOptions{DefaultProjectCWD: "/custom/project"})
	if err != nil {
		t.Fatalf("defaultSelection() error = %v", err)
	}
	if sel.ProjectCWD != "/custom/project" {
		t.Errorf("ProjectCWD = %q, want /custom/project", sel.ProjectCWD)
	}
}

// TestDefaultSelectionDemoModeDoesNotChangePackageSelection guards against a
// regression where `--demo`'s help text claimed "install demo plugins" but
// DemoMode was never consulted when building services/plugins/binaries —
// only when picking the telemetry consent value (types.ConsentDemo). A user
// running `kb-create --demo` got the exact same package set as plain
// `--yes`, silently. This pins that `--demo` (still) does not affect the
// bundle — see cmd/create.go's --demo flag description for the corrected,
// accurate claim (writes an example workflow instead).
func TestDefaultSelectionDemoModeDoesNotChangePackageSelection(t *testing.T) {
	m := sampleManifest()

	plain, err := defaultSelection(m, WizardOptions{})
	if err != nil {
		t.Fatalf("defaultSelection() error = %v", err)
	}
	demo, err := defaultSelection(m, WizardOptions{DemoMode: true})
	if err != nil {
		t.Fatalf("defaultSelection(demo) error = %v", err)
	}

	if strings.Join(plain.Services, ",") != strings.Join(demo.Services, ",") {
		t.Errorf("Services differ between --yes (%v) and --yes --demo (%v), want identical", plain.Services, demo.Services)
	}
	if strings.Join(plain.Plugins, ",") != strings.Join(demo.Plugins, ",") {
		t.Errorf("Plugins differ between --yes (%v) and --yes --demo (%v), want identical", plain.Plugins, demo.Plugins)
	}
	if strings.Join(plain.Binaries, ",") != strings.Join(demo.Binaries, ",") {
		t.Errorf("Binaries differ between --yes (%v) and --yes --demo (%v), want identical", plain.Binaries, demo.Binaries)
	}
}

func TestDefaultSelectionFallsBackToHomeAndCWD(t *testing.T) {
	m := sampleManifest()
	sel, err := defaultSelection(m, WizardOptions{})
	if err != nil {
		t.Fatalf("defaultSelection() error = %v", err)
	}

	home, _ := os.UserHomeDir()
	if !strings.HasPrefix(sel.PlatformDir, home) {
		t.Errorf("PlatformDir %q does not start with home %q", sel.PlatformDir, home)
	}
	cwd, _ := os.Getwd()
	if sel.ProjectCWD != cwd {
		t.Errorf("ProjectCWD = %q, want %q", sel.ProjectCWD, cwd)
	}
}

func TestDefaultSelectionWithNamedIntent(t *testing.T) {
	m := sampleManifest()
	sel, err := defaultSelection(m, WizardOptions{Intent: "release"})
	if err != nil {
		t.Fatalf("defaultSelection(--intent=release) error = %v", err)
	}
	if len(sel.Services) != 0 {
		t.Errorf("release Services = %v, want none", sel.Services)
	}
	if len(sel.Plugins) != 1 || sel.Plugins[0] != "mind" {
		t.Errorf("release Plugins = %v, want [mind]", sel.Plugins)
	}
	if sel.Intent != "release" {
		t.Errorf("Intent = %q, want release", sel.Intent)
	}
	if sel.FirstCommand == nil || sel.FirstCommand.Command != "kb release plan" {
		t.Errorf("FirstCommand = %+v, want kb release plan", sel.FirstCommand)
	}
}

func TestDefaultSelectionUsesLocalMode(t *testing.T) {
	sel, err := defaultSelection(sampleManifest(), WizardOptions{Intent: "release"})
	if err != nil {
		t.Fatalf("defaultSelection() error = %v", err)
	}
	if !sel.LocalMode {
		t.Error("LocalMode = false, want true for the local-first launch flow")
	}
}

func TestIntentPickerHidesLegacyIntents(t *testing.T) {
	m := sampleManifest()
	m.Intents[0].Hidden = true // explore
	m.Intents[3].Hidden = true // ai-review
	model, err := newModel(m, WizardOptions{})
	if err != nil {
		t.Fatalf("newModel() error = %v", err)
	}
	view := model.viewIntent()
	if strings.Contains(view, "Just look around") || strings.Contains(view, "Add AI review") {
		t.Errorf("viewIntent() exposes hidden intents:\n%s", view)
	}
	if !strings.Contains(view, "Automate releases") || !strings.Contains(view, "Write my own plugin") {
		t.Errorf("viewIntent() omitted visible intents:\n%s", view)
	}
}

func TestNewModelRejectsManifestWithOnlyHiddenIntents(t *testing.T) {
	m := sampleManifest()
	for i := range m.Intents {
		m.Intents[i].Hidden = true
	}
	if _, err := newModel(m, WizardOptions{}); err == nil {
		t.Fatal("newModel() error = nil, want error for a manifest with no visible intents")
	}
}

func TestDefaultSelectionUnknownIntentErrors(t *testing.T) {
	m := sampleManifest()
	_, err := defaultSelection(m, WizardOptions{Intent: "bogus"})
	if err == nil {
		t.Fatal("defaultSelection(--intent=bogus) should error, got nil")
	}
	if !strings.Contains(err.Error(), "bogus") {
		t.Errorf("error = %q, want it to mention the unknown intent", err.Error())
	}
	if !strings.Contains(err.Error(), "explore") {
		t.Errorf("error = %q, want it to list valid intent ids", err.Error())
	}
}

func TestDefaultSelectionCustomIntentErrors(t *testing.T) {
	m := sampleManifest()
	_, err := defaultSelection(m, WizardOptions{Intent: "custom"})
	if err == nil {
		t.Fatal("defaultSelection(--intent=custom) should error, got nil")
	}
	if !strings.Contains(err.Error(), "interactive") {
		t.Errorf("error = %q, want it to point at the interactive wizard", err.Error())
	}
}

// A manifest with no "intents" array predates the intent system — covers
// --dev-manifest overrides and any other manifest nobody has updated yet
// (e.g. e2e/platform/registry-manifest.json). Regression: bare --yes against
// such a manifest used to hard-fail with "unknown --intent \"explore\"" once
// intent-based selection became the default path — see the platform E2E
// failure this reproduces (kb-create ... --yes --dev-manifest ...).
func TestDefaultSelectionNoIntentsInManifestFallsBackToLegacyDefaults(t *testing.T) {
	m := &manifest.Manifest{
		Version: "1.0.0",
		Services: []manifest.Component{
			{ID: "rest", Default: true},
			{ID: "studio", Default: false},
		},
		Plugins: []manifest.Component{
			{ID: "mind", Default: true},
		},
	}
	sel, err := defaultSelection(m, WizardOptions{})
	if err != nil {
		t.Fatalf("defaultSelection() with no intents and no explicit --intent should fall back to legacy defaults, got error: %v", err)
	}
	if len(sel.Services) != 1 || sel.Services[0] != "rest" {
		t.Errorf("Services = %v, want [rest] (only default:true services)", sel.Services)
	}
	if len(sel.Plugins) != 1 || sel.Plugins[0] != "mind" {
		t.Errorf("Plugins = %v, want [mind]", sel.Plugins)
	}
}

// An explicitly-requested --intent against a manifest with no intents array
// must still error — silently falling back would hide that the caller asked
// for a named scenario the manifest doesn't define.
func TestDefaultSelectionExplicitIntentAgainstEmptyManifestErrors(t *testing.T) {
	m := &manifest.Manifest{Version: "1.0.0"}
	_, err := defaultSelection(m, WizardOptions{Intent: "release"})
	if err == nil {
		t.Fatal("defaultSelection() with an explicit --intent and no intents configured should error, got nil")
	}
}

// ── applyIntentBundle ────────────────────────────────────────────────────────

func TestApplyIntentBundleChecksCorrectItems(t *testing.T) {
	m := wizardModel{
		services: []checkItem{
			{id: "rest", checked: true},
			{id: "studio", checked: true},
		},
		plugins: []checkItem{
			{id: "mind", checked: true},
			{id: "agents", checked: true},
		},
		adapterRoles: []checkItem{
			{id: "cache"},
		},
		binaries: []checkItem{
			{id: "kb-dev", checked: true},
		},
	}

	m.applyIntentBundle(manifest.IntentBundle{
		Services: []string{"rest"},
		Plugins:  []string{"mind"},
		Adapters: map[string]string{"cache": "@kb-labs/adapters-redis@0.2.0"},
	})

	if !m.services[0].checked || m.services[1].checked {
		t.Errorf("services: rest=%v studio=%v, want true/false",
			m.services[0].checked, m.services[1].checked)
	}
	if !m.plugins[0].checked || m.plugins[1].checked {
		t.Errorf("plugins: mind=%v agents=%v, want true/false",
			m.plugins[0].checked, m.plugins[1].checked)
	}
	if !m.adapterRoles[0].checked {
		t.Error("adapterRoles: cache should be checked when present in bundle.Adapters")
	}
	// Bundle.Binaries is empty (nil) — binaries are left at their prior state,
	// not forced to none, since no launch intent needs to turn off a default tool.
	if !m.binaries[0].checked {
		t.Error("binaries: kb-dev should be left unchanged when bundle.Binaries is empty")
	}
}

func TestApplyIntentBundleOverwritesBinariesWhenSpecified(t *testing.T) {
	m := wizardModel{
		binaries: []checkItem{{id: "kb-dev", checked: false}},
	}
	m.applyIntentBundle(manifest.IntentBundle{Binaries: []string{"kb-dev"}})
	if !m.binaries[0].checked {
		t.Error("binaries: kb-dev should be checked when explicitly listed in bundle.Binaries")
	}
}

// ── enterSteps / advanceStep ─────────────────────────────────────────────────

func TestEnterStepsSkipsToConfirmWhenIntentHasNoSteps(t *testing.T) {
	m := wizardModel{
		manifest:       sampleManifest(),
		selectedIntent: intentIndex(sampleManifest(), "explore"),
	}
	m.enterSteps()
	if m.stage != stageConfirm {
		t.Errorf("stage = %v, want stageConfirm — explore has no steps, must be a 1-screen-to-confirm intent", m.stage)
	}
}

func TestEnterStepsEntersStepRunnerWhenIntentHasSteps(t *testing.T) {
	man := sampleManifest()
	m := wizardModel{
		manifest:       man,
		selectedIntent: intentIndex(man, "release"),
	}
	m.enterSteps()
	if m.stage != stageStep {
		t.Errorf("stage = %v, want stageStep — release has an envVar step", m.stage)
	}
	if m.stepIndex != 0 {
		t.Errorf("stepIndex = %d, want 0", m.stepIndex)
	}
}

func TestAdvanceStepMovesToConfirmAfterLastStep(t *testing.T) {
	man := sampleManifest()
	m := wizardModel{
		manifest:       man,
		selectedIntent: intentIndex(man, "release"), // exactly one step
		stepIndex:      0,
		stage:          stageStep,
	}
	m.advanceStep()
	if m.stage != stageConfirm {
		t.Errorf("stage = %v, want stageConfirm after the only step advances", m.stage)
	}
}

func TestAdvanceStepMovesToNextStepWhenMoreRemain(t *testing.T) {
	man := sampleManifest()
	m := wizardModel{
		manifest:       man,
		selectedIntent: intentIndex(man, "custom"), // two steps: llmProvider, studioAccess
		stepIndex:      0,
		stage:          stageStep,
	}
	m.advanceStep()
	if m.stage != stageStep {
		t.Errorf("stage = %v, want stageStep — one more step remains", m.stage)
	}
	if m.stepIndex != 1 {
		t.Errorf("stepIndex = %d, want 1", m.stepIndex)
	}
}

// ── envVar step ──────────────────────────────────────────────────────────────

func TestHandleEnvVarKeySkipProducesNoValue(t *testing.T) {
	man := sampleManifest()
	m := wizardModel{
		manifest:       man,
		selectedIntent: intentIndex(man, "release"),
		stage:          stageStep,
		stepIndex:      0,
		envCursor:      1, // "Skip for now"
	}
	step, _ := m.currentStep()
	next, _ := m.handleEnvVarKey(tea.KeyMsg{Type: tea.KeyEnter}, step)
	got := next.(wizardModel)

	if len(got.envValues) != 0 {
		t.Errorf("envValues = %v, want empty after skip", got.envValues)
	}
	if got.stage != stageConfirm {
		t.Errorf("stage = %v, want stageConfirm (release's only step just advanced)", got.stage)
	}
}

func TestHandleEnvVarKeyConfigureThenSubmitStoresValue(t *testing.T) {
	man := sampleManifest()
	m := wizardModel{
		manifest:       man,
		selectedIntent: intentIndex(man, "release"),
		stage:          stageStep,
		stepIndex:      0,
		envCursor:      0, // "Configure it now"
		envInput:       makeInput(""),
	}
	step, _ := m.currentStep()

	// First Enter opens the masked input.
	next, _ := m.handleEnvVarKey(tea.KeyMsg{Type: tea.KeyEnter}, step)
	got := next.(wizardModel)
	if !got.envShowInput {
		t.Fatal("envShowInput = false after choosing 'Configure it now', want true")
	}

	// Type a value, then Enter commits it.
	got.envInput.SetValue("npm_abc123")
	next2, _ := got.handleEnvVarKey(tea.KeyMsg{Type: tea.KeyEnter}, step)
	got2 := next2.(wizardModel)

	if got2.envValues["NPM_TOKEN"] != "npm_abc123" {
		t.Errorf("envValues[NPM_TOKEN] = %q, want npm_abc123", got2.envValues["NPM_TOKEN"])
	}
	if got2.stage != stageConfirm {
		t.Errorf("stage = %v, want stageConfirm", got2.stage)
	}
}

func TestHandleEnvVarKeyEmptyValueDoesNotAdvance(t *testing.T) {
	man := sampleManifest()
	m := wizardModel{
		manifest:       man,
		selectedIntent: intentIndex(man, "release"),
		stage:          stageStep,
		stepIndex:      0,
		envShowInput:   true,
		envInput:       makeInput(""),
	}
	step, _ := m.currentStep()
	next, _ := m.handleEnvVarKey(tea.KeyMsg{Type: tea.KeyEnter}, step)
	got := next.(wizardModel)
	if got.stage != stageStep {
		t.Errorf("stage = %v, want stageStep — empty value must not advance", got.stage)
	}
}

// ── LLM provider step ────────────────────────────────────────────────────────

func TestLLMProviderStepHidesDisabledFreeGateway(t *testing.T) {
	man := sampleManifest()
	m := wizardModel{
		manifest:       man,
		selectedIntent: intentIndex(man, "ai-review"), // single llmProvider step
		stage:          stageStep,
		stepIndex:      0,
	}
	if freeGatewayFeature.Enabled {
		t.Fatal("test requires the free gateway feature to be disabled")
	}
	view := m.viewLLMProviderStep()
	if strings.Contains(view, "50 free AI calls") {
		t.Errorf("disabled gateway must not be selectable: %s", view)
	}
	if !strings.Contains(strings.ToLower(view), "temporarily unavailable") {
		t.Errorf("disabled gateway reason is missing: %s", view)
	}
	for _, option := range llmProviderOptions() {
		if option.id == "" {
			t.Errorf("disabled free gateway must not appear in provider options: %+v", option)
		}
	}
}

func TestHandleLLMProviderKeyOpenAIRequiresKey(t *testing.T) {
	man := sampleManifest()
	m := wizardModel{
		manifest:          man,
		selectedIntent:    intentIndex(man, "ai-review"),
		stage:             stageStep,
		stepIndex:         0,
		llmProviderCursor: 0, // openai
		llmKeyInput:       makeInput(""),
	}
	next, _ := m.handleLLMProviderKey(tea.KeyMsg{Type: tea.KeyEnter})
	got := next.(wizardModel)
	if !got.llmShowKeyInput {
		t.Fatal("llmShowKeyInput = false after choosing openai, want true")
	}
	if got.stage != stageStep {
		t.Errorf("stage = %v, want stageStep — key not entered yet", got.stage)
	}

	got.llmKeyInput.SetValue("sk-test")
	next2, _ := got.handleLLMProviderKey(tea.KeyMsg{Type: tea.KeyEnter})
	got2 := next2.(wizardModel)
	if got2.llmProvider != "openai" {
		t.Errorf("llmProvider = %q, want openai", got2.llmProvider)
	}
	if got2.stage != stageConfirm {
		t.Errorf("stage = %v, want stageConfirm", got2.stage)
	}
}

// ── Studio access step ───────────────────────────────────────────────────────

// TestHandleStudioAccessKeySelectsLocal verifies the step maps cursor → localMode
// and advances past the last step in the intent's step list.
func TestHandleStudioAccessKeySelectsLocal(t *testing.T) {
	man := &manifest.Manifest{
		Intents: []manifest.Intent{
			{ID: "x", Steps: []manifest.IntentStep{{Type: stepStudioAccess}}},
		},
	}
	m := wizardModel{
		manifest:       man,
		selectedIntent: 0,
		stage:          stageStep,
		stepIndex:      0,
		studioCursor:   1, // Local
	}
	next, _ := m.handleStudioAccessKey(tea.KeyMsg{Type: tea.KeyEnter})
	got := next.(wizardModel)
	if !got.localMode {
		t.Errorf("localMode = false after selecting Local, want true")
	}
	if got.stage != stageConfirm {
		t.Errorf("stage = %v after Studio selection, want stageConfirm", got.stage)
	}
}

// ── custom picker: services/plugins/adapters/tools toggling ─────────────────

func TestToggleCursorCoversAllFourGroups(t *testing.T) {
	m := wizardModel{
		services:     []checkItem{{id: "rest"}},
		plugins:      []checkItem{{id: "mind"}},
		adapterRoles: []checkItem{{id: "cache"}},
		binaries:     []checkItem{{id: "kb-dev"}},
	}

	m.cursor = 0 // services[0]
	m.toggleCursor()
	if !m.services[0].checked {
		t.Error("toggleCursor at cursor 0 should check services[0]")
	}

	m.cursor = 1 // plugins[0]
	m.toggleCursor()
	if !m.plugins[0].checked {
		t.Error("toggleCursor at cursor 1 should check plugins[0]")
	}

	m.cursor = 2 // adapterRoles[0] ("cache")
	m.toggleCursor()
	if !m.adapterRoles[0].checked {
		t.Error("toggleCursor at cursor 2 should check adapterRoles[0] (cache)")
	}

	m.cursor = 3 // binaries[0]
	m.toggleCursor()
	if !m.binaries[0].checked {
		t.Error("toggleCursor at cursor 3 should check binaries[0]")
	}
}

// ── toSelection ─────────────────────────────────────────────────────────────

func TestToSelectionCheckedItems(t *testing.T) {
	m := wizardModel{
		platformInput:  makeInput("/platform"),
		cwdInput:       makeInput("/project"),
		selectedIntent: -1,
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
		platformInput:  makeInput("/p"),
		cwdInput:       makeInput("/c"),
		selectedIntent: -1,
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

func TestToSelectionIncludesAdapterRoleWhenChecked(t *testing.T) {
	m := wizardModel{
		platformInput:  makeInput("/p"),
		cwdInput:       makeInput("/c"),
		selectedIntent: -1,
		adapterRoles: []checkItem{
			{id: "cache", pkg: "@kb-labs/adapters-redis@0.2.0", checked: true},
		},
	}
	sel := m.toSelection()
	if sel.Adapters["cache"] != "@kb-labs/adapters-redis@0.2.0" {
		t.Errorf("Adapters[cache] = %q, want @kb-labs/adapters-redis@0.2.0", sel.Adapters["cache"])
	}
}

func TestToSelectionEnvValuesIncludesNPMToken(t *testing.T) {
	m := wizardModel{
		platformInput:  makeInput("/p"),
		cwdInput:       makeInput("/c"),
		selectedIntent: -1,
		envValues:      map[string]string{"NPM_TOKEN": "npm_abc"},
	}
	sel := m.toSelection()
	if sel.EnvValues["NPM_TOKEN"] != "npm_abc" {
		t.Errorf("EnvValues[NPM_TOKEN] = %q, want npm_abc", sel.EnvValues["NPM_TOKEN"])
	}
}

func TestToSelectionSetsIntentID(t *testing.T) {
	man := sampleManifest()
	m := wizardModel{
		platformInput:  makeInput("/p"),
		cwdInput:       makeInput("/c"),
		manifest:       man,
		selectedIntent: intentIndex(man, "release"),
	}
	sel := m.toSelection()
	if sel.Intent != "release" {
		t.Errorf("Intent = %q, want release", sel.Intent)
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

// ── LLM provider (toSelection propagation) ──────────────────────────────────

// TestToSelectionLLMProviderOpenAI verifies that when the user picks openai
// and enters a key, toSelection() propagates LLMProvider and LLMKey.
func TestToSelectionLLMProviderOpenAI(t *testing.T) {
	m := wizardModel{
		platformInput:  makeInput("/platform"),
		cwdInput:       makeInput("/project"),
		selectedIntent: -1,
		llmProvider:    "openai",
		llmKeyInput:    makeInput("sk-test-key-123"),
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
		platformInput:  makeInput("/platform"),
		cwdInput:       makeInput("/project"),
		selectedIntent: -1,
		llmProvider:    "",
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

func TestToSelectionStudioSecuredDefault(t *testing.T) {
	m := wizardModel{
		platformInput:  makeInput("/platform"),
		cwdInput:       makeInput("/project"),
		selectedIntent: -1,
		localMode:      false, // Secured (studioCursor 0)
	}
	if sel := m.toSelection(); sel.LocalMode {
		t.Errorf("LocalMode = true, want false (Secured is the default)")
	}
}

func TestToSelectionStudioLocal(t *testing.T) {
	m := wizardModel{
		platformInput:  makeInput("/platform"),
		cwdInput:       makeInput("/project"),
		selectedIntent: -1,
		localMode:      true, // Local (studioCursor 1)
	}
	if sel := m.toSelection(); !sel.LocalMode {
		t.Errorf("LocalMode = false, want true (user chose Local)")
	}
}

// ── Confirm stage: cancel vs confirm vs telemetry toggle ────────────────────

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
			m := wizardModel{stage: stageConfirm, selectedIntent: -1}
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
			m := wizardModel{stage: stageConfirm, selectedIntent: -1}
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

func TestHandleConfirmKeyTogglesTelemetry(t *testing.T) {
	m := wizardModel{stage: stageConfirm, selectedIntent: -1, telemetryEnabled: true}
	next, _ := m.handleConfirmKey(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("t")})
	got := next.(wizardModel)
	if got.telemetryEnabled {
		t.Error("telemetryEnabled = true after 't', want false")
	}
	if got.cancelled {
		t.Error("cancelled = true after 't', want false — toggling telemetry must not quit")
	}
}

// ── Run(): no TTY + no --yes → abort ─────────────────────────────────────────

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

// TestViewConfirm_DedupesComponentsAppearingAsServiceAndPlugin verifies the
// "Components:" summary line doesn't list an id twice when it's both a
// default service and a default plugin in the manifest (e.g. "marketplace").
func TestViewConfirm_DedupesComponentsAppearingAsServiceAndPlugin(t *testing.T) {
	m := wizardModel{
		platformInput:  makeInput("/tmp/platform"),
		cwdInput:       makeInput("/tmp/project"),
		selectedIntent: -1,
		services: []checkItem{
			{id: "marketplace", checked: true},
			{id: "rest", checked: true},
		},
		plugins: []checkItem{
			{id: "marketplace", checked: true},
			{id: "commit", checked: true},
		},
	}

	out := m.viewConfirm()
	if strings.Count(out, "marketplace") != 1 {
		t.Errorf("viewConfirm() should list \"marketplace\" once, got:\n%s", out)
	}
}
