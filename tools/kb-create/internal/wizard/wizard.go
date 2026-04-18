// Package wizard implements the interactive Bubble Tea TUI for kb-create.
//
// Flow:
//  1. stageDirs    — platform dir + project dir (pre-filled with defaults)
//  2. stagePreset  — pick a preset (Recommended / Minimal / Custom)
//  3. stageCustom  — only if Custom: toggle services & plugins
//  4. stageConsent — only if --demo: LLM consent + telemetry
//  5. stageConfirm — review & confirm
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

	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/types"
)

// ── Presets ──────────────────────────────────────────────────────────────────

// Preset defines a named configuration that pre-selects services and plugins.
type Preset struct {
	ID          string
	Name        string
	Description string
	// ServiceIDs / PluginIDs: nil = "all", empty = "none", list = specific.
	ServiceIDs []string
	PluginIDs  []string
}

// AllPresets is the ordered list of installation presets.
// The first preset is the default (pre-selected in the wizard).
var AllPresets = []Preset{
	{
		ID:          "recommended",
		Name:        "Recommended",
		Description: "Everything you need — all services and plugins",
		ServiceIDs:  nil, // nil = all
		PluginIDs:   nil,
	},
	{
		ID:          "minimal",
		Name:        "Minimal",
		Description: "CLI + core only, no background services",
		ServiceIDs:  []string{},
		PluginIDs:   []string{},
	},
	{
		ID:          "custom",
		Name:        "Custom",
		Description: "Choose exactly what to install",
	},
}

// resolvePreset returns the service and plugin IDs for a preset.
// nil means "all" — resolved against the manifest.
func resolvePreset(p Preset, m *manifest.Manifest) (services, plugins []string) {
	if p.ID == "custom" {
		return nil, nil // handled by custom stage
	}
	if p.ServiceIDs == nil {
		for _, s := range m.Services {
			services = append(services, s.ID)
		}
	} else {
		services = p.ServiceIDs
	}
	if p.PluginIDs == nil {
		for _, pl := range m.Plugins {
			if pl.Default {
				plugins = append(plugins, pl.ID)
			}
		}
	} else {
		plugins = p.PluginIDs
	}
	return
}

// ── Public API ───────────────────────────────────────────────────────────────

// WizardOptions controls wizard behaviour.
type WizardOptions struct {
	DefaultProjectCWD  string
	DefaultPlatformDir string
	Yes                bool // skip TUI, use "recommended" preset
	DemoMode           bool
}

// Run shows the interactive wizard and returns the user's selection.
func Run(m *manifest.Manifest, opts WizardOptions) (*installer.Selection, error) {
	if opts.Yes {
		return defaultSelection(m, opts), nil
	}
	model := newModel(m, opts)
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
	stagePreset
	stageCustom
	stageConsent
	stageConfirm
)

type checkItem struct {
	id      string
	pkg     string
	desc    string
	checked bool
}

type consentOption struct {
	choice types.ConsentChoice
	label  string
	desc   string
}

var consentOptions = []consentOption{
	{types.ConsentDemo, "Yes, run demo", "Diffs sent via KB Labs Gateway → OpenAI"},
	{types.ConsentLocal, "Local only", "No network requests, local checks only"},
	{types.ConsentOwnKey, "Use my own API key", "Direct to provider, we see nothing"},
}

type wizardModel struct {
	manifest      *manifest.Manifest
	errMsg        string
	services      []checkItem
	plugins       []checkItem
	binaries      []checkItem
	platformInput textinput.Model
	cwdInput      textinput.Model
	apiKeyInput   textinput.Model

	stage       stage
	activeInput int // 0 = platform, 1 = project (dirs stage)
	cursor      int
	cancelled   bool

	// Preset selection.
	presetCursor   int
	selectedPreset int // index into AllPresets, -1 = not yet selected

	// Demo / consent.
	demoMode         bool
	consentCursor    int
	consent          types.ConsentChoice
	showAPIKeyInput  bool
	telemetryEnabled bool
}

func newModel(m *manifest.Manifest, opts WizardOptions) wizardModel {
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

	aki := textinput.New()
	aki.Placeholder = "sk-..."
	aki.Width = 50
	aki.EchoMode = textinput.EchoPassword

	// Pre-fill services/plugins using their default flag (for Custom mode initial state).
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

	return wizardModel{
		manifest:         m,
		stage:            stageDirs,
		platformInput:    pi,
		cwdInput:         ci,
		apiKeyInput:      aki,
		services:         services,
		plugins:          plugins,
		binaries:         binaries,
		demoMode:         opts.DemoMode,
		selectedPreset:   -1,
		telemetryEnabled: true,
	}
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
	case stageConsent:
		if m.showAPIKeyInput {
			m.apiKeyInput, cmd = m.apiKeyInput.Update(msg)
		}
	}
	return m, cmd
}

func (m wizardModel) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch m.stage {
	case stageDirs:
		return m.handleDirsKey(msg)
	case stagePreset:
		return m.handlePresetKey(msg)
	case stageCustom:
		return m.handleCustomKey(msg)
	case stageConsent:
		return m.handleConsentKey(msg)
	case stageConfirm:
		return m.handleConfirmKey(msg)
	}
	return m, nil
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
		m.stage = stagePreset
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

func (m wizardModel) handlePresetKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		return m, tea.Quit
	case "up", "k":
		if m.presetCursor > 0 {
			m.presetCursor--
		}
	case "down", "j":
		if m.presetCursor < len(AllPresets)-1 {
			m.presetCursor++
		}
	case "enter":
		m.selectedPreset = m.presetCursor
		preset := AllPresets[m.selectedPreset]

		if preset.ID == "custom" {
			m.stage = stageCustom
			m.cursor = 0
			return m, nil
		}

		// Apply preset selections.
		svcs, plugs := resolvePreset(preset, m.manifest)
		m.applySelection(svcs, plugs)

		m.stage = stageConsent
		m.consentCursor = 0
	}
	return m, nil
}

func (m wizardModel) handleCustomKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	total := len(m.services) + len(m.plugins) + len(m.binaries)
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
		m.stage = stageConsent
		m.consentCursor = 0
	}
	return m, nil
}

func (m wizardModel) handleConsentKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if m.showAPIKeyInput {
		switch msg.String() {
		case "ctrl+c", "esc":
			m.showAPIKeyInput = false
			m.apiKeyInput.Blur()
			return m, nil
		case "enter":
			if strings.TrimSpace(m.apiKeyInput.Value()) == "" {
				return m, nil
			}
			m.consent = types.ConsentOwnKey
			m.stage = stageConfirm
			return m, nil
		}
		var cmd tea.Cmd
		m.apiKeyInput, cmd = m.apiKeyInput.Update(msg)
		return m, cmd
	}

	// In non-demo mode the consent screen only has the telemetry toggle (cursor=0).
	// In demo mode it also has the three LLM consent options (cursor 0-2) plus telemetry (cursor 3).
	maxCursor := 0
	if m.demoMode {
		maxCursor = len(consentOptions)
	}
	switch msg.String() {
	case "ctrl+c", "esc":
		m.cancelled = true
		return m, tea.Quit
	case "up", "k":
		if m.consentCursor > 0 {
			m.consentCursor--
		}
	case "down", "j":
		if m.consentCursor < maxCursor {
			m.consentCursor++
		}
	case " ":
		if m.consentCursor == maxCursor {
			m.telemetryEnabled = !m.telemetryEnabled
		}
	case "enter":
		if !m.demoMode {
			// Non-demo: only the telemetry toggle is here; enter moves forward.
			m.stage = stageConfirm
			return m, nil
		}
		if m.consentCursor == maxCursor {
			m.telemetryEnabled = !m.telemetryEnabled
			return m, nil
		}
		chosen := consentOptions[m.consentCursor]
		if chosen.choice == types.ConsentOwnKey {
			m.showAPIKeyInput = true
			m.apiKeyInput.Focus()
			return m, textinput.Blink
		}
		m.consent = chosen.choice
		m.stage = stageConfirm
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

// ── View ─────────────────────────────────────────────────────────────────────

func (m wizardModel) View() string {
	switch m.stage {
	case stageDirs:
		return m.viewDirs()
	case stagePreset:
		return m.viewPreset()
	case stageCustom:
		return m.viewCustom()
	case stageConsent:
		return m.viewConsent()
	case stageConfirm:
		return m.viewConfirm()
	}
	return ""
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

func (m wizardModel) viewPreset() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  setup\n\n")

	for i, p := range AllPresets {
		cursor := "  "
		if i == m.presetCursor {
			cursor = focusStyle.Render(" ▶")
		}
		radio := "○"
		nameStyle := normalStyle
		if i == m.presetCursor {
			radio = focusStyle.Render("●")
			nameStyle = focusStyle
		}
		fmt.Fprintf(&b, "%s %s  %s\n", cursor, radio, nameStyle.Render(p.Name))
		fmt.Fprintf(&b, "      %s\n\n", dimStyle.Render(p.Description))
	}

	b.WriteString(helpStyle.Render("  ↑↓ move · enter select · esc quit"))
	return b.String()
}

func (m wizardModel) viewCustom() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  custom setup\n\n")

	if len(m.services) > 0 {
		b.WriteString("  " + sectionStyle.Render("Services") + "\n")
		for i, s := range m.services {
			b.WriteString(m.renderItem(i, s))
		}
		b.WriteString("\n")
	}

	if len(m.plugins) > 0 {
		b.WriteString("  " + sectionStyle.Render("Plugins") + "\n")
		for i, p := range m.plugins {
			b.WriteString(m.renderItem(len(m.services)+i, p))
		}
		b.WriteString("\n")
	}

	if len(m.binaries) > 0 {
		b.WriteString("  " + sectionStyle.Render("Tools") + "\n")
		for i, bin := range m.binaries {
			b.WriteString(m.renderItem(len(m.services)+len(m.plugins)+i, bin))
		}
		b.WriteString("\n")
	}

	b.WriteString(helpStyle.Render("  ↑↓ move · space toggle · enter next · esc quit"))
	return b.String()
}

func (m wizardModel) viewConsent() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  data consent\n\n")

	if m.demoMode {
		b.WriteString("  Demo includes AI-powered code review.\n")
		b.WriteString("  Choose how to handle LLM requests:\n\n")

		for i, opt := range consentOptions {
			cursor := "  "
			if i == m.consentCursor {
				cursor = focusStyle.Render(" ▶")
			}
			radio := "○"
			style := normalStyle
			if i == m.consentCursor {
				radio = focusStyle.Render("◉")
				style = focusStyle
			}
			fmt.Fprintf(&b, "%s %s  %-22s %s\n", cursor, radio, style.Render(opt.label), dimStyle.Render(opt.desc))
		}

		if m.showAPIKeyInput {
			b.WriteString("\n  " + sectionStyle.Render("API Key") + "\n")
			b.WriteString("  " + m.apiKeyInput.View() + "\n")
			b.WriteString(dimStyle.Render("  Your key goes directly to the provider.\n"))
		}

		b.WriteString("\n")
	}

	b.WriteString("  " + sectionStyle.Render("Analytics") + "\n")
	telCursor := "  "
	if m.consentCursor == len(consentOptions) || !m.demoMode {
		telCursor = focusStyle.Render(" ▶")
	}
	check := "○"
	if m.telemetryEnabled {
		check = selectedStyle.Render("◉")
	}
	fmt.Fprintf(&b, "%s %s  %s  %s\n\n", telCursor, check,
		normalStyle.Render("Send anonymous usage statistics"),
		dimStyle.Render("(helps improve KB Labs)"),
	)

	if m.showAPIKeyInput {
		b.WriteString(helpStyle.Render("  enter confirm · esc back"))
	} else if m.demoMode {
		b.WriteString(helpStyle.Render("  ↑↓ move · space toggle analytics · enter select · esc quit"))
	} else {
		b.WriteString(helpStyle.Render("  space toggle · enter continue · esc quit"))
	}
	return b.String()
}

func (m wizardModel) viewConfirm() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("  KB Labs") + "  ready to install\n\n")
	fmt.Fprintf(&b, "  Platform:  %s\n", focusStyle.Render(m.platformInput.Value()))
	fmt.Fprintf(&b, "  Project:   %s\n", focusStyle.Render(m.cwdInput.Value()))

	if m.selectedPreset >= 0 {
		preset := AllPresets[m.selectedPreset]
		fmt.Fprintf(&b, "  Setup:     %s\n", focusStyle.Render(preset.Name))
	}

	// Show selected components.
	var selected []string
	for _, s := range m.services {
		if s.checked {
			selected = append(selected, s.id)
		}
	}
	for _, p := range m.plugins {
		if p.checked {
			selected = append(selected, p.id)
		}
	}
	if len(selected) > 0 {
		fmt.Fprintf(&b, "\n  Components: %s\n", dimStyle.Render(strings.Join(selected, ", ")))
	}

	if m.demoMode {
		consentLabel := "local only"
		for _, opt := range consentOptions {
			if opt.choice == m.consent {
				consentLabel = opt.label
			}
		}
		fmt.Fprintf(&b, "\n  Demo:       %s\n", focusStyle.Render(consentLabel))
		telLabel := "off"
		if m.telemetryEnabled {
			telLabel = "on"
		}
		fmt.Fprintf(&b, "  Analytics:  %s\n", dimStyle.Render(telLabel))
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

func (m *wizardModel) applySelection(serviceIDs, pluginIDs []string) {
	svcSet := toSet(serviceIDs)
	plSet := toSet(pluginIDs)
	for i := range m.services {
		m.services[i].checked = svcSet[m.services[i].id]
	}
	for i := range m.plugins {
		m.plugins[i].checked = plSet[m.plugins[i].id]
	}
}

func (m *wizardModel) toggleCursor() {
	if m.cursor < len(m.services) {
		m.services[m.cursor].checked = !m.services[m.cursor].checked
	} else if m.cursor < len(m.services)+len(m.plugins) {
		i := m.cursor - len(m.services)
		m.plugins[i].checked = !m.plugins[i].checked
	} else {
		i := m.cursor - len(m.services) - len(m.plugins)
		m.binaries[i].checked = !m.binaries[i].checked
	}
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
	sel := &installer.Selection{
		PlatformDir:      expandHome(m.platformInput.Value()),
		ProjectCWD:       expandHome(m.cwdInput.Value()),
		Services:         services,
		Plugins:          plugins,
		Binaries:         binaries,
		DemoMode:         m.demoMode,
		Consent:          m.consent,
		TelemetryEnabled: m.telemetryEnabled,
	}
	if m.consent == types.ConsentOwnKey {
		sel.APIKey = m.apiKeyInput.Value()
	}
	return sel
}

// defaultSelection returns the "recommended" preset without TUI.
func defaultSelection(m *manifest.Manifest, opts WizardOptions) *installer.Selection {
	home, _ := os.UserHomeDir()
	platformDir := opts.DefaultPlatformDir
	if platformDir == "" {
		platformDir = filepath.Join(home, "kb-platform")
	}
	cwd := opts.DefaultProjectCWD
	if cwd == "" {
		cwd, _ = os.Getwd()
	}

	// Recommended preset: default services + default plugins + default binaries.
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
