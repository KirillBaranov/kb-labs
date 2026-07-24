// Package wizard implements the interactive Bubble Tea TUI for kb-create.
//
// Flow:
//  1. stageDirs    — platform dir + project dir (pre-filled with defaults)
//  2. stageIntent  — pick what you're here to do (from manifest.Intents)
//  3. stageCustom  — only if the "custom" intent was picked: toggle
//     services/plugins/adapter-roles/tools yourself
//  4. stageStep    — runs the chosen intent's ordered setup steps
//     (envVar / llmProvider / studioAccess), skipped entirely when the
//     intent has none
//  5. stageConfirm — review & confirm (telemetry toggle lives here too)
//
// Intents replace the old taxonomy-first preset screen: instead of asking
// the user to already understand "service vs plugin vs adapter," the wizard
// asks what they're trying to do and only walks them through the specific,
// real config that scenario needs. New scenarios are a manifest.json entry,
// not a wizard code change — see docs/adr for the full rationale.
//
// When WizardOptions.Yes is true the TUI is skipped entirely.
package wizard

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/mattn/go-isatty"

	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/types"
)

// ── Adapter role opt-ins (custom picker) ────────────────────────────────────

// adapterRoleOption is a role with no wired default in manifest.json's
// adapterConfig.adapters (today: only "cache") that the custom picker lets
// the user opt into. Package/version is a fixed literal, matching the
// existing convention used across kb-create for this exact role (see
// `kb-create install --adapters "cache=..."`, scaffold.go's cache comment).
// This is NOT a free-text package/version entry — that already exists via
// `kb-create install --adapters role=pkg@ver` for anyone who needs a
// non-default package.
type adapterRoleOption struct {
	role string
	pkg  string
	desc string
}

var adapterRoleOptions = []adapterRoleOption{
	{role: "cache", pkg: "@kb-labs/adapters-redis@0.2.0", desc: "Redis-backed cache — opt-in, no default (requires a running Redis)"},
}

// ── Public API ───────────────────────────────────────────────────────────────

// WizardOptions controls wizard behaviour.
type WizardOptions struct {
	DefaultProjectCWD  string
	DefaultPlatformDir string
	Yes                bool // skip TUI, use the "explore" intent
	Intent             string
	DemoMode           bool
}

// Run shows the interactive wizard and returns the user's selection.
func Run(m *manifest.Manifest, opts WizardOptions) (*installer.Selection, error) {
	if opts.Yes {
		return defaultSelection(m, opts)
	}
	if !isatty.IsTerminal(os.Stdin.Fd()) && !isatty.IsCygwinTerminal(os.Stdin.Fd()) {
		return nil, fmt.Errorf("no TTY detected — run with --yes to skip the wizard")
	}
	model, err := newModel(m, opts)
	if err != nil {
		return nil, err
	}
	p := tea.NewProgram(model, tea.WithAltScreen())
	final, err := p.Run()
	if err != nil {
		return nil, err
	}
	result := final.(wizardModel)
	if result.cancelled {
		return nil, fmt.Errorf("installation cancelled")
	}
	return result.toSelection(), nil
}

// ── Styles ───────────────────────────────────────────────────────────────────

var (
	titleStyle    lipgloss.Style
	sectionStyle  lipgloss.Style
	selectedStyle lipgloss.Style
	normalStyle   lipgloss.Style
	dimStyle      lipgloss.Style
	focusStyle    lipgloss.Style
	errorStyle    lipgloss.Style
	helpStyle     lipgloss.Style
)

func init() {
	enabled := colorEnabled()
	titleStyle = lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "12"))
	sectionStyle = lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "8"))
	selectedStyle = lipgloss.NewStyle().Foreground(color(enabled, "10"))
	normalStyle = lipgloss.NewStyle().Foreground(color(enabled, "7"))
	dimStyle = lipgloss.NewStyle().Foreground(color(enabled, "8"))
	focusStyle = lipgloss.NewStyle().Foreground(color(enabled, "14"))
	errorStyle = lipgloss.NewStyle().Foreground(color(enabled, "9"))
	helpStyle = dimStyle
}

// ── Model ────────────────────────────────────────────────────────────────────

type stage int

const (
	stageDirs stage = iota
	stageIntent
	stageCustom
	stageStep // generic runner for the chosen intent's envVar/llmProvider/studioAccess steps
	stageAnalytics
	stageConfirm
)

type checkItem struct {
	id      string
	pkg     string
	desc    string
	checked bool
}

type wizardModel struct {
	manifest      *manifest.Manifest
	errMsg        string
	services      []checkItem
	plugins       []checkItem
	adapterRoles  []checkItem
	binaries      []checkItem
	platformInput textinput.Model
	cwdInput      textinput.Model

	stage       stage
	activeInput int // 0 = platform, 1 = project (dirs stage)
	cursor      int
	cancelled   bool

	// Intent selection.
	intentCursor   int // index into visibleIntentIndexes
	selectedIntent int // index into manifest.Intents, -1 = not yet chosen

	// Step runner (envVar / llmProvider / studioAccess), driven by the
	// chosen intent's Steps list.
	stepIndex int

	// envVar step state.
	envCursor    int // 0 = configure now, 1 = skip
	envShowInput bool
	envInput     textinput.Model
	envValues    map[string]string

	// llmProvider step state.
	llmProvider       string // "openai" | "anthropic" | "" (skip)
	llmKeyInput       textinput.Model
	llmProviderCursor int
	llmShowKeyInput   bool

	// studioAccess step state. false = secured (auth on, 0.0.0.0, default),
	// true = local single-user (auth off, 127.0.0.1, Studio without login).
	localMode    bool
	studioCursor int // 0 = Secured, 1 = Local

	telemetryEnabled bool
	analyticsCursor  int // 0 = share anonymous technical events, 1 = keep analytics off
	demoMode         bool
}

func newModel(m *manifest.Manifest, opts WizardOptions) (wizardModel, error) {
	if len(m.Intents) == 0 {
		return wizardModel{}, fmt.Errorf("manifest has no intents configured — cannot run the interactive wizard")
	}
	visible := false
	for _, intent := range m.Intents {
		if !intent.Hidden {
			visible = true
			break
		}
	}
	if !visible {
		return wizardModel{}, fmt.Errorf("manifest has no visible intents configured — cannot run the interactive wizard")
	}

	platformDir := opts.DefaultPlatformDir
	if platformDir == "" {
		home, _ := os.UserHomeDir()
		platformDir = filepath.Join(home, "kb-platform")
	}
	cwd := opts.DefaultProjectCWD
	if cwd == "" {
		cwd, _ = os.Getwd()
	}

	pi := textinput.New()
	pi.Placeholder = "~/kb-platform"
	pi.SetValue(platformDir)
	pi.Focus()
	pi.Width = 50

	ci := textinput.New()
	ci.Placeholder = "~/projects/my-project"
	ci.SetValue(cwd)
	ci.Width = 50

	ei := textinput.New()
	ei.Width = 50
	ei.EchoMode = textinput.EchoPassword

	lki := textinput.New()
	lki.Placeholder = "sk-... (your API key)"
	lki.Width = 50
	lki.EchoMode = textinput.EchoPassword

	// Pre-fill services/plugins/binaries using their default flag — this is
	// the starting point the "custom" intent's picker adjusts from; every
	// other intent overwrites it via applyIntentBundle once chosen.
	services := make([]checkItem, len(m.Services))
	for i, s := range m.Services {
		services[i] = checkItem{id: s.ID, pkg: s.Pkg, desc: s.Description, checked: s.Default}
	}
	plugins := make([]checkItem, len(m.Plugins))
	for i, p := range m.Plugins {
		plugins[i] = checkItem{id: p.ID, pkg: p.Pkg, desc: p.Description, checked: p.Default}
	}
	binaries := make([]checkItem, len(m.Binaries))
	for i, b := range m.Binaries {
		binaries[i] = checkItem{id: b.ID, desc: b.Description, checked: b.Default}
	}
	adapterRoles := make([]checkItem, len(adapterRoleOptions))
	for i, a := range adapterRoleOptions {
		adapterRoles[i] = checkItem{id: a.role, pkg: a.pkg, desc: a.desc}
	}

	return wizardModel{
		manifest:       m,
		stage:          stageDirs,
		platformInput:  pi,
		cwdInput:       ci,
		envInput:       ei,
		llmKeyInput:    lki,
		services:       services,
		plugins:        plugins,
		binaries:       binaries,
		adapterRoles:   adapterRoles,
		demoMode:       opts.DemoMode,
		selectedIntent: -1,
		// Local-first is the launch default. Cloud/team onboarding is not a
		// launch-ready flow, so it must never be selected implicitly.
		localMode:        true,
		analyticsCursor:  1,
		telemetryEnabled: false,
	}, nil
}

// ── tea.Model interface ──────────────────────────────────────────────────────

func (m wizardModel) Init() tea.Cmd { return textinput.Blink }

func (m wizardModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if key, ok := msg.(tea.KeyMsg); ok {
		return m.handleKey(key)
	}
	var cmd tea.Cmd
	switch m.stage {
	case stageDirs:
		if m.activeInput == 0 {
			m.platformInput, cmd = m.platformInput.Update(msg)
		} else {
			m.cwdInput, cmd = m.cwdInput.Update(msg)
		}
	case stageStep:
		if step, ok := m.currentStep(); ok {
			switch step.Type {
			case stepEnvVar:
				if m.envShowInput {
					m.envInput, cmd = m.envInput.Update(msg)
				}
			case stepLLMProvider:
				if m.llmShowKeyInput {
					m.llmKeyInput, cmd = m.llmKeyInput.Update(msg)
				}
			}
		}
	}
	return m, cmd
}

func (m wizardModel) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch m.stage {
	case stageDirs:
		return m.handleDirsKey(msg)
	case stageIntent:
		return m.handleIntentKey(msg)
	case stageCustom:
		return m.handleCustomKey(msg)
	case stageStep:
		return m.handleStepKey(msg)
	case stageAnalytics:
		return m.handleAnalyticsKey(msg)
	case stageConfirm:
		return m.handleConfirmKey(msg)
	}
	return m, nil
}

// ── Step-type vocabulary ─────────────────────────────────────────────────────

const (
	stepEnvVar       = "envVar"
	stepLLMProvider  = "llmProvider"
	stepStudioAccess = "studioAccess"
)

func (m wizardModel) currentIntent() manifest.Intent {
	return m.manifest.Intents[m.selectedIntent]
}

func (m wizardModel) currentStep() (manifest.IntentStep, bool) {
	steps := m.currentIntent().Steps
	if m.stepIndex < 0 || m.stepIndex >= len(steps) {
		return manifest.IntentStep{}, false
	}
	return steps[m.stepIndex], true
}

// enterSteps moves into stageStep, or to the independent analytics decision
// when the chosen intent has no setup steps.
func (m *wizardModel) enterSteps() {
	m.stepIndex = 0
	if len(m.currentIntent().Steps) == 0 {
		m.stage = stageAnalytics
		return
	}
	m.stage = stageStep
	m.resetCurrentStepState()
}

// advanceStep moves to the next step, or the independent analytics decision
// once the list is exhausted.
func (m *wizardModel) advanceStep() {
	m.stepIndex++
	if m.stepIndex >= len(m.currentIntent().Steps) {
		m.stage = stageAnalytics
		return
	}
	m.resetCurrentStepState()
}

// resetCurrentStepState clears sub-step UI state (e.g. "show key input")
// left over from a previous step, so each step starts on its top-level view.
func (m *wizardModel) resetCurrentStepState() {
	m.envCursor = 0
	m.envShowInput = false
	m.llmProviderCursor = 0
	m.llmShowKeyInput = false
	m.studioCursor = 0
}

// ── Key handlers ─────────────────────────────────────────────────────────────

func (m wizardModel) handleDirsKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		return m, tea.Quit
	case "tab", "down":
		m.activeInput = 1 - m.activeInput
		if m.activeInput == 0 {
			m.platformInput.Focus()
			m.cwdInput.Blur()
		} else {
			m.cwdInput.Focus()
			m.platformInput.Blur()
		}
		return m, textinput.Blink
	case "enter":
		if err := m.validateDirs(); err != nil {
			m.errMsg = err.Error()
			return m, nil
		}
		m.errMsg = ""
		m.stage = stageIntent
		return m, nil
	}
	var cmd tea.Cmd
	if m.activeInput == 0 {
		m.platformInput, cmd = m.platformInput.Update(msg)
	} else {
		m.cwdInput, cmd = m.cwdInput.Update(msg)
	}
	return m, cmd
}

func (m wizardModel) handleIntentKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	indexes := m.visibleIntentIndexes()
	switch msg.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		return m, tea.Quit
	case "up", "k":
		if m.intentCursor > 0 {
			m.intentCursor--
		}
	case "down", "j":
		if m.intentCursor < len(indexes)-1 {
			m.intentCursor++
		}
	case "enter":
		m.selectedIntent = indexes[m.intentCursor]
		intent := m.currentIntent()

		if intent.ID == "custom" {
			m.stage = stageCustom
			m.cursor = 0
			return m, nil
		}

		m.applyIntentBundle(intent.Bundle)
		m.enterSteps()
	}
	return m, nil
}

func (m wizardModel) handleCustomKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	total := len(m.services) + len(m.plugins) + len(m.adapterRoles) + len(m.binaries)
	switch msg.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		return m, tea.Quit
	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
	case "down", "j":
		if m.cursor < total-1 {
			m.cursor++
		}
	case " ":
		m.toggleCursor()
	case "enter":
		m.enterSteps()
	}
	return m, nil
}

func (m wizardModel) handleStepKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	step, ok := m.currentStep()
	if !ok {
		m.stage = stageConfirm
		return m, nil
	}
	switch step.Type {
	case stepEnvVar:
		return m.handleEnvVarKey(msg, step)
	case stepLLMProvider:
		return m.handleLLMProviderKey(msg)
	case stepStudioAccess:
		return m.handleStudioAccessKey(msg)
	}
	// Unknown step type authored in the manifest — skip it rather than get stuck.
	m.advanceStep()
	return m, nil
}

func (m wizardModel) handleEnvVarKey(msg tea.KeyMsg, step manifest.IntentStep) (tea.Model, tea.Cmd) {
	if m.envShowInput {
		switch msg.String() {
		case "ctrl+c", "esc":
			m.envShowInput = false
			m.envInput.Blur()
			m.envInput.SetValue("")
			return m, nil
		case "enter":
			val := strings.TrimSpace(m.envInput.Value())
			if val == "" {
				return m, nil
			}
			if m.envValues == nil {
				m.envValues = map[string]string{}
			}
			m.envValues[step.Key] = val
			m.advanceStep()
			return m, nil
		}
		var cmd tea.Cmd
		m.envInput, cmd = m.envInput.Update(msg)
		return m, cmd
	}

	switch msg.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		return m, tea.Quit
	case "up", "k":
		if m.envCursor > 0 {
			m.envCursor--
		}
	case "down", "j":
		if m.envCursor < 1 {
			m.envCursor++
		}
	case "enter":
		if m.envCursor == 0 {
			m.envInput.SetValue("")
			m.envInput.Placeholder = step.Label
			m.envShowInput = true
			m.envInput.Focus()
			return m, textinput.Blink
		}
		// Skip — no value collected, hint is shown on the confirm screen.
		m.advanceStep()
	}
	return m, nil
}

func (m wizardModel) handleLLMProviderKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	options := llmProviderOptions()
	if m.llmShowKeyInput {
		switch msg.String() {
		case "ctrl+c", "esc":
			m.llmShowKeyInput = false
			m.llmKeyInput.Blur()
			m.llmKeyInput.SetValue("")
			return m, nil
		case "enter":
			key := strings.TrimSpace(m.llmKeyInput.Value())
			if key == "" {
				return m, nil
			}
			m.llmProvider = options[m.llmProviderCursor].id
			m.advanceStep()
			return m, nil
		}
		var cmd tea.Cmd
		m.llmKeyInput, cmd = m.llmKeyInput.Update(msg)
		return m, cmd
	}

	switch msg.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		return m, tea.Quit
	case "up", "k":
		if m.llmProviderCursor > 0 {
			m.llmProviderCursor--
		}
	case "down", "j":
		if m.llmProviderCursor < len(options)-1 {
			m.llmProviderCursor++
		}
	case "enter":
		chosen := options[m.llmProviderCursor]
		if chosen.id == "" {
			m.llmProvider = ""
			m.advanceStep()
			return m, nil
		}
		m.llmShowKeyInput = true
		m.llmKeyInput.SetValue("")
		m.llmKeyInput.Focus()
		return m, textinput.Blink
	}
	return m, nil
}

// studioAccessOptions: 0 = Secured (default), 1 = Local single-user.
var studioAccessOptions = []struct {
	name string
	desc string
}{
	{"Secured (recommended)", "Login required. Gateway binds 0.0.0.0 — safe for shared/remote use."},
	{"Local (no login)", "Single-user. Gateway binds 127.0.0.1, auth off — Studio opens instantly."},
}

func (m wizardModel) handleStudioAccessKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		return m, tea.Quit
	case "up", "k":
		if m.studioCursor > 0 {
			m.studioCursor--
		}
	case "down", "j":
		if m.studioCursor < len(studioAccessOptions)-1 {
			m.studioCursor++
		}
	case "enter":
		m.localMode = m.studioCursor == 1
		m.advanceStep()
	}
	return m, nil
}

func (m wizardModel) handleConfirmKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "esc", "n", "N":
		m.cancelled = true
		return m, tea.Quit
	case "enter", "y", "Y":
		return m, tea.Quit
	}
	return m, nil
}

func (m wizardModel) handleAnalyticsKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		return m, tea.Quit
	case "up", "k":
		if m.analyticsCursor > 0 {
			m.analyticsCursor--
		}
	case "down", "j":
		if m.analyticsCursor < 1 {
			m.analyticsCursor++
		}
	case "enter":
		m.telemetryEnabled = m.analyticsCursor == 0
		m.stage = stageConfirm
	}
	return m, nil
}

// ── View ─────────────────────────────────────────────────────────────────────

func (m wizardModel) View() string {
	switch m.stage {
	case stageDirs:
		return m.viewDirs()
	case stageIntent:
		return m.viewIntent()
	case stageCustom:
		return m.viewCustom()
	case stageStep:
		return m.viewStep()
	case stageAnalytics:
		return m.viewAnalytics()
	case stageConfirm:
		return m.viewConfirm()
	}
	return ""
}

func (m wizardModel) viewAnalytics() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  analytics\n\n")
	b.WriteString("  " + sectionStyle.Render("Share anonymous technical usage events?") + "\n")
	b.WriteString(dimStyle.Render("  This helps improve onboarding. It never changes what KB Labs installs or runs.") + "\n\n")
	options := []struct{ name, desc string }{
		{"Share analytics", "Installation outcome, selected outcome ID, package manager, and error category. No code, diff, secrets, or prompts."},
		{"Keep analytics off", "No usage events are sent. You can enable it later without reinstalling."},
	}
	for i, opt := range options {
		cursor := "  "
		if i == m.analyticsCursor {
			cursor = focusStyle.Render(" ▶")
		}
		radio := "○"
		nameStyle := normalStyle
		if i == m.analyticsCursor {
			radio = focusStyle.Render("●")
			nameStyle = focusStyle
		}
		fmt.Fprintf(&b, "%s %s  %s\n", cursor, radio, nameStyle.Render(opt.name))
		fmt.Fprintf(&b, "      %s\n\n", dimStyle.Render(opt.desc))
	}
	b.WriteString(helpStyle.Render("  ↑↓ move · enter select · esc quit"))
	return b.String()
}

func (m wizardModel) viewDirs() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  installer\n\n")

	b.WriteString("  " + sectionStyle.Render("Platform directory") + "\n")
	b.WriteString("  " + m.platformInput.View() + "\n")
	b.WriteString(dimStyle.Render("  Where the platform will be installed\n\n"))

	b.WriteString("  " + sectionStyle.Render("Project directory") + "\n")
	b.WriteString("  " + m.cwdInput.View() + "\n")
	b.WriteString(dimStyle.Render("  Your project root\n\n"))

	if m.errMsg != "" {
		b.WriteString("  " + errorStyle.Render("✖ "+m.errMsg) + "\n\n")
	}

	b.WriteString(helpStyle.Render("  tab switch · enter next · esc quit"))
	return b.String()
}

func (m wizardModel) viewIntent() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  what are you here to do?\n\n")

	for cursorIndex, intentIndex := range m.visibleIntentIndexes() {
		intent := m.manifest.Intents[intentIndex]
		cursor := "  "
		if cursorIndex == m.intentCursor {
			cursor = focusStyle.Render(" ▶")
		}
		radio := "○"
		nameStyle := normalStyle
		if cursorIndex == m.intentCursor {
			radio = focusStyle.Render("●")
			nameStyle = focusStyle
		}
		fmt.Fprintf(&b, "%s %s  %s\n", cursor, radio, nameStyle.Render(intent.Label))
		fmt.Fprintf(&b, "      %s\n\n", dimStyle.Render(intent.Description))
	}

	b.WriteString(helpStyle.Render("  ↑↓ move · enter select · esc quit"))
	return b.String()
}

func (m wizardModel) viewCustom() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  custom setup\n\n")

	offset := 0
	if len(m.services) > 0 {
		b.WriteString("  " + sectionStyle.Render("Services") + "\n")
		for i, s := range m.services {
			b.WriteString(m.renderItem(offset+i, s))
		}
		b.WriteString("\n")
	}
	offset += len(m.services)

	if len(m.plugins) > 0 {
		b.WriteString("  " + sectionStyle.Render("Plugins") + "\n")
		for i, p := range m.plugins {
			b.WriteString(m.renderItem(offset+i, p))
		}
		b.WriteString("\n")
	}
	offset += len(m.plugins)

	if len(m.adapterRoles) > 0 {
		b.WriteString("  " + sectionStyle.Render("Adapters") + "\n")
		for i, a := range m.adapterRoles {
			b.WriteString(m.renderItem(offset+i, a))
		}
		b.WriteString("\n")
	}
	offset += len(m.adapterRoles)

	if len(m.binaries) > 0 {
		b.WriteString("  " + sectionStyle.Render("Tools") + "\n")
		for i, bin := range m.binaries {
			b.WriteString(m.renderItem(offset+i, bin))
		}
		b.WriteString("\n")
	}

	b.WriteString(helpStyle.Render("  ↑↓ move · space toggle · enter next · esc quit"))
	return b.String()
}

func (m wizardModel) viewStep() string {
	step, ok := m.currentStep()
	if !ok {
		return ""
	}
	switch step.Type {
	case stepEnvVar:
		return m.viewEnvVarStep(step)
	case stepLLMProvider:
		return m.viewLLMProviderStep()
	case stepStudioAccess:
		return m.viewStudioAccessStep()
	}
	return ""
}

func (m wizardModel) viewEnvVarStep(step manifest.IntentStep) string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  " + step.Label + "\n\n")

	if m.envShowInput {
		b.WriteString("  " + sectionStyle.Render(step.Label) + "\n")
		b.WriteString("  " + m.envInput.View() + "\n\n")
		b.WriteString(helpStyle.Render("  enter confirm · esc back"))
		return b.String()
	}

	options := []string{"Configure it now", "Skip for now"}
	for i, name := range options {
		cursor := "  "
		if i == m.envCursor {
			cursor = focusStyle.Render(" ▶")
		}
		radio := "○"
		nameStyle := normalStyle
		if i == m.envCursor {
			radio = focusStyle.Render("●")
			nameStyle = focusStyle
		}
		fmt.Fprintf(&b, "%s %s  %s\n", cursor, radio, nameStyle.Render(name))
	}
	if step.SkipHint != "" {
		fmt.Fprintf(&b, "\n      %s\n", dimStyle.Render(step.SkipHint))
	}

	b.WriteString("\n" + helpStyle.Render("  ↑↓ move · enter select · esc quit"))
	return b.String()
}

func (m wizardModel) viewLLMProviderStep() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  LLM provider\n\n")
	options := llmProviderOptions()

	if m.llmShowKeyInput {
		provider := options[m.llmProviderCursor]
		b.WriteString("  " + sectionStyle.Render(provider.name+" API key") + "\n")
		b.WriteString(dimStyle.Render("  "+provider.desc) + "\n\n")
		b.WriteString("  " + m.llmKeyInput.View() + "\n\n")
		b.WriteString(dimStyle.Render("  Saved to a gitignored .env file, never written to kb.config.jsonc.") + "\n\n")
		b.WriteString(helpStyle.Render("  enter confirm · esc back"))
		return b.String()
	}

	b.WriteString("  " + sectionStyle.Render("Choose your AI provider") + "\n\n")
	if !freeGatewayFeature.Enabled {
		b.WriteString("  " + dimStyle.Render(freeGatewayFeature.Label+" — "+freeGatewayFeature.DisabledReason) + "\n\n")
	}

	for i, opt := range options {
		cursor := "  "
		if i == m.llmProviderCursor {
			cursor = focusStyle.Render(" ▶")
		}
		radio := "○"
		nameStyle := normalStyle
		if i == m.llmProviderCursor {
			radio = focusStyle.Render("●")
			nameStyle = focusStyle
		}
		fmt.Fprintf(&b, "%s %s  %s\n", cursor, radio, nameStyle.Render(opt.name))
		fmt.Fprintf(&b, "      %s\n\n", dimStyle.Render(opt.desc))
	}

	b.WriteString(helpStyle.Render("  ↑↓ move · enter select · esc quit"))
	return b.String()
}

func (m wizardModel) viewStudioAccessStep() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  Studio access\n\n")
	b.WriteString("  " + sectionStyle.Render("How do you want to access Studio?") + "\n")
	b.WriteString(dimStyle.Render("  Local mode disables auth — only do this on your own machine.") + "\n\n")

	for i, opt := range studioAccessOptions {
		cursor := "  "
		if i == m.studioCursor {
			cursor = focusStyle.Render(" ▶")
		}
		radio := "○"
		nameStyle := normalStyle
		if i == m.studioCursor {
			radio = focusStyle.Render("●")
			nameStyle = focusStyle
		}
		fmt.Fprintf(&b, "%s %s  %s\n", cursor, radio, nameStyle.Render(opt.name))
		fmt.Fprintf(&b, "      %s\n\n", dimStyle.Render(opt.desc))
	}

	b.WriteString(helpStyle.Render("  ↑↓ move · enter select · esc quit"))
	return b.String()
}

func (m wizardModel) viewConfirm() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  ready to install\n\n")
	fmt.Fprintf(&b, "  Platform:  %s\n", focusStyle.Render(m.platformInput.Value()))
	fmt.Fprintf(&b, "  Project:   %s\n", focusStyle.Render(m.cwdInput.Value()))

	var intent *manifest.Intent
	if m.selectedIntent >= 0 {
		i := m.currentIntent()
		intent = &i
		fmt.Fprintf(&b, "  Goal:      %s\n", focusStyle.Render(intent.Label))
		if intent.FirstCommand != nil {
			fmt.Fprintf(&b, "  First run: %s\n", focusStyle.Render(intent.FirstCommand.Command))
			fmt.Fprintf(&b, "             %s\n", dimStyle.Render(intent.FirstCommand.Description))
		}
	}
	fmt.Fprintf(&b, "  Mode:      %s\n", dimStyle.Render("Local on this computer — Studio stays on 127.0.0.1"))

	// Show selected components. A component (e.g. "marketplace") can be both
	// a default service and a default plugin in the manifest, so dedupe by id
	// while preserving first-seen order.
	var selected []string
	seen := make(map[string]bool)
	addSelected := func(id string) {
		if !seen[id] {
			seen[id] = true
			selected = append(selected, id)
		}
	}
	for _, s := range m.services {
		if s.checked {
			addSelected(s.id)
		}
	}
	for _, p := range m.plugins {
		if p.checked {
			addSelected(p.id)
		}
	}
	if len(selected) > 0 {
		fmt.Fprintf(&b, "\n  Components: %s\n", dimStyle.Render(strings.Join(selected, ", ")))
	}
	var adapterRoleNames []string
	for _, a := range m.adapterRoles {
		if a.checked {
			adapterRoleNames = append(adapterRoleNames, a.id)
		}
	}
	if len(adapterRoleNames) > 0 {
		fmt.Fprintf(&b, "  Adapters:   %s\n", dimStyle.Render(strings.Join(adapterRoleNames, ", ")))
	}

	// Only explain an LLM when the chosen first command needs one. A release
	// plan should not look as though it sends data to an AI service.
	llmLabel := "not needed for this outcome"
	if intent != nil && intent.FirstCommand != nil && intent.FirstCommand.Requirements.LLM != "" {
		llmLabel = "your own provider is required"
		if !freeGatewayFeature.Enabled {
			llmLabel += " · KB Labs Gateway is temporarily unavailable"
		}
	}
	if m.llmProvider != "" {
		providerName := m.llmProvider
		for _, opt := range llmProviderOptions() {
			if opt.id == m.llmProvider {
				providerName = opt.name
				break
			}
		}
		llmLabel = providerName + " (key saved to .env)"
	}
	fmt.Fprintf(&b, "\n  LLM:        %s\n", focusStyle.Render(llmLabel))
	if intent != nil && intent.FirstCommand != nil && intent.FirstCommand.DataBoundary != "" {
		fmt.Fprintf(&b, "  Data:       %s\n", dimStyle.Render(intent.FirstCommand.DataBoundary))
	}

	if len(m.envValues) > 0 {
		var keys []string
		for k := range m.envValues {
			keys = append(keys, k)
		}
		fmt.Fprintf(&b, "  Configured: %s (saved to .env)\n", dimStyle.Render(strings.Join(keys, ", ")))
	}

	telLabel := "off"
	if m.telemetryEnabled {
		telLabel = "on"
	}
	fmt.Fprintf(&b, "  Analytics:  %s\n", dimStyle.Render(telLabel))

	if intent != nil && len(intent.NextSteps) > 0 {
		b.WriteString("\n  " + sectionStyle.Render("Next steps") + "\n")
		for _, step := range intent.NextSteps {
			fmt.Fprintf(&b, "    %s\n", dimStyle.Render(step))
		}
	}
	if intent != nil && len(intent.Docs) > 0 {
		b.WriteString("\n  " + sectionStyle.Render("Docs") + "\n")
		for _, d := range intent.Docs {
			fmt.Fprintf(&b, "    %s: %s\n", d.Label, dimStyle.Render(d.URL))
		}
	}

	b.WriteString("\n")
	b.WriteString(helpStyle.Render("  enter install · n cancel"))
	return b.String()
}

func (m wizardModel) renderItem(idx int, item checkItem) string {
	cursor := "  "
	if idx == m.cursor {
		cursor = focusStyle.Render(" ▶")
	}
	check := "○"
	style := normalStyle
	if item.checked {
		check = selectedStyle.Render("◉")
		style = selectedStyle
	}
	return fmt.Sprintf("%s %s  %-15s  %s\n", cursor, check, style.Render(item.id), dimStyle.Render(item.desc))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// applyIntentBundle overwrites the services/plugins/adapterRoles checklist to
// match the chosen intent's bundle exactly (not merged with prior state).
// Binaries are intentionally left at their manifest-default state — no
// launch intent needs to turn off a default tool, only opt kb-dev in.
func (m *wizardModel) applyIntentBundle(b manifest.IntentBundle) {
	svcSet := toSet(b.Services)
	plSet := toSet(b.Plugins)
	binSet := toSet(b.Binaries)
	for i := range m.services {
		m.services[i].checked = svcSet[m.services[i].id]
	}
	for i := range m.plugins {
		m.plugins[i].checked = plSet[m.plugins[i].id]
	}
	for i := range m.adapterRoles {
		_, ok := b.Adapters[m.adapterRoles[i].id]
		m.adapterRoles[i].checked = ok
	}
	if len(b.Binaries) > 0 {
		for i := range m.binaries {
			m.binaries[i].checked = binSet[m.binaries[i].id]
		}
	}
}

func (m *wizardModel) toggleCursor() {
	idx := m.cursor
	if idx < len(m.services) {
		m.services[idx].checked = !m.services[idx].checked
		return
	}
	idx -= len(m.services)
	if idx < len(m.plugins) {
		m.plugins[idx].checked = !m.plugins[idx].checked
		return
	}
	idx -= len(m.plugins)
	if idx < len(m.adapterRoles) {
		m.adapterRoles[idx].checked = !m.adapterRoles[idx].checked
		return
	}
	idx -= len(m.adapterRoles)
	m.binaries[idx].checked = !m.binaries[idx].checked
}

func (m wizardModel) validateDirs() error {
	if strings.TrimSpace(m.platformInput.Value()) == "" {
		return fmt.Errorf("platform directory is required")
	}
	if strings.TrimSpace(m.cwdInput.Value()) == "" {
		return fmt.Errorf("project directory is required")
	}
	return nil
}

// visibleIntentIndexes hides legacy/full-platform routes from the first-run
// launcher while retaining their stable IDs for --yes --intent and existing
// automation.
func (m wizardModel) visibleIntentIndexes() []int {
	indexes := make([]int, 0, len(m.manifest.Intents))
	for i, intent := range m.manifest.Intents {
		if !intent.Hidden {
			indexes = append(indexes, i)
		}
	}
	return indexes
}

func (m wizardModel) toSelection() *installer.Selection {
	var services, plugins, binaries []string
	for _, s := range m.services {
		if s.checked {
			services = append(services, s.id)
		}
	}
	for _, p := range m.plugins {
		if p.checked {
			plugins = append(plugins, p.id)
		}
	}
	for _, b := range m.binaries {
		if b.checked {
			binaries = append(binaries, b.id)
		}
	}
	adapters := map[string]string{}
	for _, a := range m.adapterRoles {
		if a.checked {
			adapters[a.id] = a.pkg
		}
	}

	consent := types.ConsentSkipped
	if m.demoMode {
		if m.llmProvider != "" {
			consent = types.ConsentOwnKey
		} else {
			consent = types.ConsentDemo
		}
	}

	var (
		intentID     string
		firstCommand *manifest.FirstCommand
	)
	if m.selectedIntent >= 0 {
		intent := m.currentIntent()
		intentID = intent.ID
		firstCommand = intent.FirstCommand
	}
	sel := &installer.Selection{
		PlatformDir:      expandHome(m.platformInput.Value()),
		ProjectCWD:       expandHome(m.cwdInput.Value()),
		Services:         services,
		Plugins:          plugins,
		Binaries:         binaries,
		Adapters:         adapters,
		DemoMode:         m.demoMode,
		Consent:          consent,
		TelemetryEnabled: m.telemetryEnabled,
		LLMProvider:      m.llmProvider,
		LocalMode:        m.localMode,
		Intent:           intentID,
		FirstCommand:     firstCommand,
	}
	if m.llmProvider != "" {
		sel.LLMKey = m.llmKeyInput.Value()
	}
	if v, ok := m.envValues["NPM_TOKEN"]; ok {
		sel.EnvValues = map[string]string{"NPM_TOKEN": v}
	}
	return sel
}

// defaultSelection returns the chosen (or "explore") intent's bundle without
// the TUI. opts.Intent selects a named intent non-interactively; empty means
// "explore" — the same footprint bare --yes has always installed.
//
// Manifests that predate the intent system (--dev-manifest overrides,
// e2e/platform/registry-manifest.json, any third-party manifest with no
// "intents" array) have Intents == nil. For those, an unspecified --intent
// falls back to legacyDefaultSelection (the pre-intent default-marked-items
// bundle) instead of erroring on a missing "explore" entry — so bare --yes
// keeps working unchanged against manifests nobody has updated. An
// explicitly-passed --intent against such a manifest still errors: the
// caller asked for a named scenario that doesn't exist, and silently
// falling back would hide that.
func defaultSelection(m *manifest.Manifest, opts WizardOptions) (*installer.Selection, error) {
	intentID := opts.Intent
	if intentID == "" && len(m.Intents) == 0 {
		return legacyDefaultSelection(m, opts), nil
	}
	if intentID == "" {
		intentID = "explore"
	}
	if intentID == "custom" {
		return nil, fmt.Errorf(`--intent=custom requires the interactive wizard (or "kb-create install --plugins/--services" for scripted arbitrary selection)`)
	}

	var intent *manifest.Intent
	for i := range m.Intents {
		if m.Intents[i].ID == intentID {
			intent = &m.Intents[i]
			break
		}
	}
	if intent == nil {
		return nil, fmt.Errorf("unknown --intent %q — valid intents: %s", intentID, validIntentIDs(m))
	}
	if intent.FirstCommand != nil && intent.FirstCommand.Requirements.LLM == "required" {
		return nil, fmt.Errorf("--intent=%s needs an LLM provider key — run kb-create interactively to configure OpenAI or Anthropic", intentID)
	}

	home, _ := os.UserHomeDir()
	platformDir := opts.DefaultPlatformDir
	if platformDir == "" {
		platformDir = filepath.Join(home, "kb-platform")
	}
	cwd := opts.DefaultProjectCWD
	if cwd == "" {
		cwd, _ = os.Getwd()
	}

	consent := types.ConsentSkipped
	if opts.DemoMode {
		consent = types.ConsentDemo
	}

	return &installer.Selection{
		PlatformDir:      expandHome(platformDir),
		ProjectCWD:       expandHome(cwd),
		Services:         intent.Bundle.Services,
		Plugins:          intent.Bundle.Plugins,
		Binaries:         intent.Bundle.Binaries,
		Adapters:         intent.Bundle.Adapters,
		DemoMode:         opts.DemoMode,
		Consent:          consent,
		TelemetryEnabled: false,
		LocalMode:        true,
		Intent:           intent.ID,
		FirstCommand:     intent.FirstCommand,
	}, nil
}

// legacyDefaultSelection is the pre-intent default-marked-items bundle —
// every service/plugin/binary with "default": true in the manifest. Used
// when a manifest has no "intents" array at all (see defaultSelection).
func legacyDefaultSelection(m *manifest.Manifest, opts WizardOptions) *installer.Selection {
	home, _ := os.UserHomeDir()
	platformDir := opts.DefaultPlatformDir
	if platformDir == "" {
		platformDir = filepath.Join(home, "kb-platform")
	}
	cwd := opts.DefaultProjectCWD
	if cwd == "" {
		cwd, _ = os.Getwd()
	}

	var services, plugins, binaries []string
	for _, s := range m.Services {
		if s.Default {
			services = append(services, s.ID)
		}
	}
	for _, p := range m.Plugins {
		if p.Default {
			plugins = append(plugins, p.ID)
		}
	}
	for _, b := range m.Binaries {
		if b.Default {
			binaries = append(binaries, b.ID)
		}
	}

	consent := types.ConsentSkipped
	if opts.DemoMode {
		consent = types.ConsentDemo
	}

	return &installer.Selection{
		PlatformDir:      expandHome(platformDir),
		ProjectCWD:       expandHome(cwd),
		Services:         services,
		Plugins:          plugins,
		Binaries:         binaries,
		DemoMode:         opts.DemoMode,
		Consent:          consent,
		TelemetryEnabled: false,
	}
}

func validIntentIDs(m *manifest.Manifest) string {
	ids := make([]string, len(m.Intents))
	for i, intent := range m.Intents {
		ids[i] = intent.ID
	}
	return strings.Join(ids, ", ")
}

func expandHome(path string) string {
	if strings.HasPrefix(path, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, path[2:])
	}
	return path
}

func toSet(ids []string) map[string]bool {
	m := make(map[string]bool, len(ids))
	for _, id := range ids {
		m[id] = true
	}
	return m
}

func color(enabled bool, ansi string) lipgloss.TerminalColor {
	if !enabled {
		return lipgloss.NoColor{}
	}
	return lipgloss.Color(ansi)
}

func colorEnabled() bool {
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	if strings.EqualFold(os.Getenv("TERM"), "dumb") {
		return false
	}
	fi, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}
