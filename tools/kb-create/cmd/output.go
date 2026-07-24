package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/manifest"
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
	llmHint := styleMuted.Render("(re-run and pick a provider, or add OPENAI_API_KEY to .env)")
	if llmEnabled {
		llmStatus = onStyle.Render("on")
		llmHint = styleMuted.Render("API key in .env")
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
	line(dim.Render("These use an LLM. Configure your own provider key:"))
	line("")
	line("Re-run:  " + cmd.Render("kb-create .") + dim.Render("  and pick OpenAI / Anthropic"))
	line("Or set:  " + cmd.Render("OPENAI_API_KEY") + dim.Render(" / ") + cmd.Render("ANTHROPIC_API_KEY") + dim.Render(" in .env"))
	line(dim.Render("Docs: https://docs.kblabs.ru/adapters/built-in#llm-illm"))
	fmt.Printf("  %s%s\n", botLeft, rule)
	fmt.Println()
}

// printBootstrapAdminCredentials shows the seeded admin login once, right after
// install, for non-local (auth-enabled) runs. This is the only time the plaintext
// password is ever displayed — it's also saved to .env
// (GATEWAY_BOOTSTRAP_ADMIN_PASSWORD) and the gateway auto-provisions a separate
// CLI credential to ~/.kb/credentials.json, but neither of those is a substitute
// for showing it here: a user who loses .env has no other way to log into Studio.
func printBootstrapAdminCredentials(email, password string) {
	accent := lipgloss.NewStyle().Foreground(lipgloss.Color("141")) // soft purple
	dim := lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	white := lipgloss.NewStyle().Foreground(lipgloss.Color("15"))
	cmd := lipgloss.NewStyle().Foreground(lipgloss.Color("14")).Bold(true)
	warn := lipgloss.NewStyle().Foreground(lipgloss.Color("11")).Bold(true)

	border := accent.Render("│")
	topLeft := accent.Render("╭")
	botLeft := accent.Render("╰")
	line := func(s string) { fmt.Printf("  %s  %s\n", border, s) }

	width := 58
	rule := accent.Render(strings.Repeat("─", width))

	fmt.Printf("  %s%s\n", topLeft, rule)
	line(white.Render("Studio admin login") + "  " + warn.Render("(shown once — save it now)"))
	line("")
	line(dim.Render("Email     ") + cmd.Render(email))
	line(dim.Render("Password  ") + cmd.Render(password))
	line("")
	line(dim.Render("Also saved to .env (GATEWAY_BOOTSTRAP_ADMIN_PASSWORD) and to"))
	line(dim.Render("~/.kb/credentials.json (separate CLI token) — this is the only"))
	line(dim.Render("place the password itself is printed."))
	fmt.Printf("  %s%s\n", botLeft, rule)
	fmt.Println()
}

// ── outcome handoff ─────────────────────────────────────────────────────────

// printOutcomeHandoff ends onboarding with one safe, runnable next step. The
// selected outcome is the sole source of this action: it never infers review,
// commit, or service commands from the project.
func printOutcomeHandoff(r *installer.Result, first *manifest.FirstCommand, pendingInput string) {
	if r.ServicesWarning != "" {
		newOutput().Warn(r.ServicesWarning)
		fmt.Println()
	}

	fmt.Println(styleDivider)
	fmt.Println()
	if first == nil {
		fmt.Println("  " + styleBold.Render("Installation is ready"))
		fmt.Println()
		fmt.Println("  Run " + styleWhite.Render("kb-create doctor") + " to verify this installation.")
		fmt.Println()
		return
	}
	if first.Operation != manifest.CommandOperationAnalyze {
		newOutput().Warn("The selected first command is not safe to run automatically.")
		fmt.Println("  Run " + styleWhite.Render("kb-create doctor") + " to inspect the installation before continuing.")
		fmt.Println()
		return
	}

	fmt.Println("  " + styleBold.Render("Ready"))
	fmt.Println()
	fmt.Println("  " + styleMuted.Render(first.Description))
	fmt.Println()
	fmt.Println("  Run this next:")
	fmt.Println("    " + styleWhite.Render(first.Command))
	if pendingInput != "" {
		fmt.Println()
		fmt.Println("  Before you run it: " + styleMuted.Render(pendingInput))
	}
	if first.Studio {
		fmt.Println()
		fmt.Println("  Diagnostics: " + styleMuted.Render("kb-create doctor"))
	}
	fmt.Println()
}

func printCustomPluginSummary(pluginDir, commandName string) {
	if pluginDir == "" || commandName == "" {
		return
	}
	fmt.Println("  " + styleBold.Render("Your plugin"))
	fmt.Println("  " + styleMuted.Render(pluginDir))
	fmt.Println("  Manifest: " + styleMuted.Render(pluginDir+"/packages/"+commandName+"-entry/src/manifest.ts"))
	fmt.Println("  Handler:  " + styleMuted.Render(pluginDir+"/packages/"+commandName+"-entry/src"))
	fmt.Println()
}

// printSupportHint shows a compact support block with GitHub Issues and
// Telegram contact — called whenever an install or doctor run fails.
func printSupportHint() {
	accent := lipgloss.NewStyle().Foreground(lipgloss.Color("141"))
	dim := lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	white := lipgloss.NewStyle().Foreground(lipgloss.Color("15"))
	url := lipgloss.NewStyle().Foreground(lipgloss.Color("14"))

	border := accent.Render("│")
	topLeft := accent.Render("╭")
	botLeft := accent.Render("╰")
	line := func(s string) { fmt.Printf("  %s  %s\n", border, s) }

	width := 58
	rule := accent.Render(strings.Repeat("─", width))

	fmt.Println()
	fmt.Printf("  %s%s\n", topLeft, rule)
	line(white.Render("Need help?"))
	line("")
	line("  " + dim.Render("Open an issue   ") + url.Render("github.com/kb-labs-team/kb-labs/issues"))
	line("  " + dim.Render("Telegram        ") + url.Render("@kirill_baranov"))
	fmt.Printf("  %s%s\n", botLeft, rule)
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
