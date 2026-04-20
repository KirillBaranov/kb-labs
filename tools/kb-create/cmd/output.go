package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"github.com/kb-labs/create/internal/installer"
)

var (
	colorEnabled_ = detectColor()

	styleBold   = lipgloss.NewStyle().Bold(true)
	_           = newStyle("10") // reserved for future use
	styleBlue   = newStyle("14")
	styleDim    = newStyle("8")
	styleWhite  = lipgloss.NewStyle().Foreground(lipgloss.Color("15"))
	styleMuted  = newStyle("244")
	styleAccent = newStyle("141") // soft purple

	styleBanner = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("141")).
			Padding(0, 2).
			Bold(true).
			Foreground(lipgloss.Color("15"))

	styleDivider = styleDim.Render(strings.Repeat("─", 45))

	styleKV = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
)

func newStyle(ansi string) lipgloss.Style {
	if !colorEnabled_ {
		return lipgloss.NewStyle()
	}
	return lipgloss.NewStyle().Foreground(lipgloss.Color(ansi))
}

// ── primitives ────────────────────────────────────────────────────────────────

type output struct {
	// kept for compatibility with existing callers (doctor, status, etc.)
	infoTag string
	okTag   string
	warnTag string
	errTag  string
	label   lipgloss.Style
	value   lipgloss.Style
	dim     lipgloss.Style
	bullet  lipgloss.Style
}

func newOutput() output {
	enabled := colorEnabled_
	return output{
		infoTag: lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "14")).Render("[INFO]"),
		okTag:   lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "10")).Render("[ OK ]"),
		warnTag: lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "11")).Render("[WARN]"),
		errTag:  lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "9")).Render("[ERR ]"),
		label:   lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "8")),
		value:   lipgloss.NewStyle().Foreground(color(enabled, "14")),
		dim:     lipgloss.NewStyle().Foreground(color(enabled, "8")),
		bullet:  lipgloss.NewStyle().Foreground(color(enabled, "10")),
	}
}

func (o output) Info(msg string) { fmt.Printf("%s %s\n", o.infoTag, msg) }
func (o output) OK(msg string)   { fmt.Printf("%s %s\n", o.okTag, msg) }
func (o output) Warn(msg string) { fmt.Printf("%s %s\n", o.warnTag, msg) }
func (o output) Err(msg string)  { fmt.Printf("%s %s\n", o.errTag, msg) }

func (o output) Section(title string) {
	fmt.Printf("\n%s %s\n", o.infoTag, o.label.Render(title))
}

func (o output) KeyValue(k, v string) {
	fmt.Printf("  %s %s\n", o.label.Render(k+":"), o.value.Render(v))
}

func (o output) Bullet(label, details string) {
	if details == "" {
		fmt.Printf("    %s %s\n", o.bullet.Render("●"), label)
		return
	}
	fmt.Printf("    %s %-15s  %s\n", o.bullet.Render("●"), label, o.dim.Render(details))
}

func (o output) BulletDim(label, details string) {
	fmt.Printf("    %s %-15s  %s\n", o.dim.Render("○"), o.dim.Render(label), o.dim.Render(details))
}

// ── install success banner ────────────────────────────────────────────────────

func printSuccess(r *installer.Result) {
	fmt.Println()
	fmt.Println(styleBanner.Render("✦  KB Labs installed successfully"))
	fmt.Println()

	kw := styleKV.Render
	fmt.Printf("  %s   %s\n", kw("Platform"), styleBlue.Render(r.PlatformDir))
	fmt.Printf("  %s    %s\n", kw("Project"), styleBlue.Render(r.ProjectCWD))
	fmt.Println()
}

// printDataConsent shows a short data-use summary so the user always knows
// what was opted in/out — even in --yes (silent) mode.
// When LLM is off, a recommendation block explains the benefit and data policy.
func printDataConsent(analyticsEnabled, llmEnabled bool) {
	kw := styleKV.Render
	onStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("10")) // green
	offStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("8")) // dim

	llmStatus := offStyle.Render("off")
	llmHint := styleMuted.Render("(run kb-create . --llm to enable)")
	if llmEnabled {
		llmStatus = onStyle.Render("on")
		llmHint = styleMuted.Render("KB Labs Gateway · 50 free requests")
	}

	analyticsStatus := offStyle.Render("off")
	analyticsHint := ""
	if analyticsEnabled {
		analyticsStatus = onStyle.Render("on")
		analyticsHint = styleMuted.Render("anonymous usage stats")
	}

	fmt.Printf("  %-11s %s  %s\n", kw("LLM"), llmStatus, llmHint)
	fmt.Printf("  %-11s %s  %s\n", kw("Analytics"), analyticsStatus, analyticsHint)
	fmt.Println()

	if !llmEnabled {
		printLLMRecommendation()
	}
}

// printLLMRecommendation prints a one-time notice explaining what LLM adds,
// how the data flows, and how to opt in — shown only when LLM is off.
func printLLMRecommendation() {
	accent := lipgloss.NewStyle().Foreground(lipgloss.Color("141")) // soft purple
	dim := lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	white := lipgloss.NewStyle().Foreground(lipgloss.Color("15"))
	cmd := lipgloss.NewStyle().Foreground(lipgloss.Color("14")).Bold(true)

	border := accent.Render("│")
	topLeft := accent.Render("╭")
	botLeft := accent.Render("╰")
	line := func(s string) { fmt.Printf("  %s  %s\n", border, s) }

	width := 58
	rule := accent.Render(strings.Repeat("─", width))

	fmt.Printf("  %s%s\n", topLeft, rule)
	line(white.Render("Enable LLM for a better experience"))
	line("")
	line("  " + dim.Render("AI commit messages") + "    " + cmd.Render("kb commit commit"))
	line("  " + dim.Render("AI code review") + "        " + cmd.Render("kb review run"))
	line("")
	line(dim.Render("50 free requests via KB Labs Gateway."))
	line(dim.Render("Your code diffs are proxied to the LLM vendor — not stored."))
	line("")
	line("Run:  " + cmd.Render("kb-create . --llm"))
	line(dim.Render("Docs: https://docs.kblabs.ru/adapters/built-in#llm-illm"))
	fmt.Printf("  %s%s\n", botLeft, rule)
	fmt.Println()
}

// ── next steps ────────────────────────────────────────────────────────────────

// nextStep is one line in the "What's next" section.
type nextStep struct {
	cmd  string
	desc string
}

// buildNextSteps returns the ordered list of post-install commands to show.
// Each step is only included when its prerequisites are actually satisfied,
// so the user never sees a command that won't work.
func buildNextSteps(r *installer.Result, llmEnabled bool) []nextStep {
	reviewCmd := "kb review run"
	if llmEnabled {
		reviewCmd = "kb review run --mode=full"
	}
	steps := []nextStep{
		{"cd " + r.ProjectCWD, ""},
		{reviewCmd, "review your last diff"},
		{"kb commit commit", "generate a commit message"},
	}

	// Suggest service startup after the user has seen the first results.
	kbDevInstalled := false
	for _, name := range r.InstalledBinaries {
		if name == "kb-dev" {
			kbDevInstalled = true
			break
		}
	}
	if kbDevInstalled && r.HasServices {
		steps = append(steps, nextStep{"kb-dev start", "start background services (gateway, workflow, studio)"})
	}

	steps = append(steps, nextStep{"kb --help", "explore all commands"})
	return steps
}

func printNextSteps(r *installer.Result, llmEnabled bool) {
	fmt.Println(styleDivider)
	fmt.Println()
	fmt.Println("  " + styleBold.Render("What's next"))
	fmt.Println()

	arrow := styleAccent.Render("→")
	for _, s := range buildNextSteps(r, llmEnabled) {
		padded := fmt.Sprintf("%-32s", s.cmd)
		fmt.Printf("  %s  %s%s\n", arrow, styleWhite.Render(padded), styleMuted.Render(s.desc))
	}
	fmt.Println()
}

// ── helpers ───────────────────────────────────────────────────────────────────

func color(enabled bool, ansi string) lipgloss.TerminalColor {
	if !enabled {
		return lipgloss.NoColor{}
	}
	return lipgloss.Color(ansi)
}

func detectColor() bool {
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

// colorEnabled kept for callers that use it directly.
func colorEnabled() bool { return colorEnabled_ }
