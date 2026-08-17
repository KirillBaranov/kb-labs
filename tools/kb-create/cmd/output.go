package cmd

import (
	"errors"
	"fmt"
	"os"
	"runtime"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
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

// ── shared rail UI kit ───────────────────────────────────────────────────────

type railSection struct {
	Title string
	Lines []string
}

type railBlock struct {
	Title    string
	Sections []railSection
	Footer   []string
	Error    bool
}

// printCompletionBlock renders the single end-of-install handoff. Keep all
// user-facing next steps here so success output does not fragment into a
// collection of unrelated notices.
func printCompletionBlock(r *installer.Result, first *manifest.FirstCommand, pendingInput, pluginDir, commandName, handoffPath string, agentLines []string, docs []manifest.IntentDoc, nextSteps []string, llmEnabled, analyticsEnabled bool) {
	// Keep a stable plain-text success marker for scripts and older clients;
	// the structured rail below remains the canonical human presentation.
	fmt.Println("KB Labs installed successfully")
	installed := []string{
		railKeyValue("Platform", styleBlue.Render(r.PlatformDir)),
		railKeyValue("Project", styleBlue.Render(r.ProjectCWD)),
	}
	if pluginDir != "" && commandName != "" {
		installed = append(installed,
			railKeyValue("Plugin", commandName),
			railKeyValue("Status", "registered and ready"),
		)
	}

	next := []string{}
	if first == nil {
		next = append(next, railKeyValue("Run", "kb-create doctor"))
	} else if first.Operation != manifest.CommandOperationAnalyze {
		next = append(next, "Run kb-create doctor before continuing.")
	} else {
		next = append(next, railKeyValue("Run", styleWhite.Render("cd "+shellQuote(r.ProjectCWD)+" && "+first.Command)))
		if pendingInput != "" {
			next = append(next, "Before running it: "+styleMuted.Render(pendingInput))
		}
	}

	continueLines := []string{
		"With an agent — paste this prompt:",
		"Create a KB Labs plugin that [describe your business case].",
		"It should expose a safe first command and include tests.",
	}
	for _, doc := range docs {
		if doc.Label == "" || doc.URL == "" {
			continue
		}
		continueLines = append(continueLines, railKeyValue("Read "+doc.Label, styleBlue.Render(doc.URL)))
	}
	if len(nextSteps) > 0 {
		continueLines = append(continueLines, "Next steps:")
		for _, step := range nextSteps {
			if step != "" {
				continueLines = append(continueLines, "  "+styleWhite.Render(step))
			}
		}
	}
	if handoffPath != "" {
		continueLines = append(continueLines, railKeyValue("Handoff", styleMuted.Render(handoffPath)))
	}

	configLines := []string{
		railKeyValue("LLM", statusLabel(llmEnabled)),
		railKeyValue("Analytics", statusLabel(analyticsEnabled)),
	}
	sections := []railSection{{Title: "Installed", Lines: installed}}
	if len(agentLines) > 0 {
		sections = append(sections, railSection{Title: "Agent tools", Lines: agentLines})
	}
	sections = append(sections,
		railSection{Title: "Next step", Lines: next},
		railSection{Title: "Continue", Lines: continueLines},
		railSection{Title: "Configuration", Lines: configLines},
	)
	printRailBlock(railBlock{Title: "KB Labs is ready", Sections: sections})
}

func statusLabel(enabled bool) string {
	if enabled {
		return styleBlue.Render("on")
	}
	return styleMuted.Render("off")
}

func shellQuote(value string) string {
	if value != "" && !strings.ContainsAny(value, " \t\n'\";$&()[]{}<>|*") {
		return value
	}
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

// printDataConsent shows a short data-use summary so the user always knows
// what was opted in/out — even in --yes (silent) mode.
// When LLM is off, a recommendation block explains the benefit and data policy.
func printDataConsent(analyticsEnabled, llmEnabled bool) {
	kw := styleKV.Render
	onStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("10")) // green
	offStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("8")) // dim

	llmStatus := offStyle.Render("off")
	llmHint := styleMuted.Render("(set OPENAI_API_KEY in .env to enable)")
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

}

// printBootstrapAdminCredentials shows the seeded admin login once, right after
// install, for non-local (auth-enabled) runs. This is the only time the plaintext
// password is ever displayed — it's also saved to .env
// (GATEWAY_BOOTSTRAP_ADMIN_PASSWORD) and the gateway auto-provisions a separate
// CLI credential to ~/.kb/credentials.json, but neither of those is a substitute
// for showing it here: a user who loses .env has no other way to log into Studio.
func printBootstrapAdminCredentials(email, password string) {
	dim := lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	cmd := lipgloss.NewStyle().Foreground(lipgloss.Color("14")).Bold(true)

	printRailNotice("Studio admin login  "+styleMuted.Render("(shown once — save it now)"), []string{
		railKeyValue("Email", cmd.Render(email)),
		railKeyValue("Password", cmd.Render(password)),
		"",
		dim.Render("Also saved to .env (GATEWAY_BOOTSTRAP_ADMIN_PASSWORD) and"),
		dim.Render("~/.kb/credentials.json (separate CLI token). This is the only"),
		dim.Render("place the password itself is printed."),
	})
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
		fmt.Println("  Observe in Studio: " + styleMuted.Render("kb-dev start  →  http://127.0.0.1:3000"))
		fmt.Println("  " + styleMuted.Render("Use it when the command needs attention: inspect its status and logs, then choose the next available action."))
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

func printAgentHandoff(path string) {
	if path == "" {
		return
	}
	fmt.Println("  Agent handoff: " + styleMuted.Render(path))
	fmt.Println()
}

// printSupportHint gives a compact recovery route after an install or doctor
// failure. It intentionally uses one left rail instead of a closed box: the
// error above remains the primary information, while support is a next step.
func printSupportHint(logPath string) {
	dim := lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	url := lipgloss.NewStyle().Foreground(lipgloss.Color("14"))

	fmt.Println()
	lines := []string{
		dim.Render("No successful install state was recorded."),
	}
	if logPath != "" {
		lines = append(lines, railKeyValue("Full log", styleBlue.Render(logPath)))
	}
	lines = append(lines,
		"",
		railKeyValue("Troubleshooting", url.Render("https://docs.kblabs.ru/en/guides/troubleshooting")),
		railKeyValue("Report issue", url.Render("https://github.com/kb-labs-team/kb-labs/issues")),
	)
	printRailNotice("What to do next", lines)
	fmt.Println()
}

// printRailBlock is the shared terminal UI primitive for onboarding notices.
// It deliberately starts at column zero: a single left rail groups related
// information without a boxed frame, inherited indentation, or competing
// visual language.
func printRailBlock(block railBlock) {
	rail := styleAccent.Render("│")
	icon := styleAccent.Render("◆")
	if block.Error {
		icon = lipgloss.NewStyle().Foreground(lipgloss.Color("9")).Render("✗")
	}
	fmt.Println(icon + " " + styleBold.Render(block.Title))
	for _, section := range block.Sections {
		if section.Title != "" {
			fmt.Println(rail)
			fmt.Println(rail + " " + styleBold.Render(section.Title))
		}
		for _, line := range section.Lines {
			printRailLine(rail, line)
		}
	}
	for _, line := range block.Footer {
		printRailLine(rail, line)
	}
}

func printRailNotice(title string, lines []string) {
	printRailBlock(railBlock{Title: title, Sections: []railSection{{Lines: lines}}})
}

func printRailErrorBlock(title string, lines []string) {
	printRailBlock(railBlock{Title: title, Error: true, Sections: []railSection{{Lines: lines}}})
}

func printRailLine(rail, line string) {
	for _, part := range strings.Split(line, "\n") {
		if part == "" {
			fmt.Println(rail)
			continue
		}
		fmt.Println(rail + " " + part)
	}
}

func railKeyValue(label, value string) string {
	return styleMuted.Render(fmt.Sprintf("%-18s", label)) + " " + value
}

// printFatalError preserves the complete fatal error in the terminal so it can
// be pasted into an issue. It intentionally includes only runtime facts, never
// project paths, source code, API keys, or user configuration values.
func printFatalError(err error, version string) {
	title := "Installation failed"
	lines := make([]string, 0)
	var commandErr *pm.CommandError
	if errors.As(err, &commandErr) {
		title = "Package installation failed"
		lines = append(lines, "The package registry or dependency set rejected an artifact.")
		if summary := pm.FailureSummary(err); summary != "" {
			lines = append(lines, "", "Package-manager detail:", summary)
		}
	}
	errText := strings.TrimSpace(err.Error())
	if commandErr != nil {
		// The wrapped action error includes CommandError.Error(). Its output has
		// already been rendered as the dedicated detail section above.
		errText = strings.TrimSpace(strings.Replace(errText, commandErr.Error(), "", 1))
		errText = strings.TrimSuffix(errText, ":")
	}
	for _, line := range strings.Split(errText, "\n") {
		if strings.HasPrefix(line, "pnpm ") || strings.TrimSpace(line) == "" {
			continue
		}
		lines = append(lines, line)
	}
	lines = append(lines, "", "Runtime: "+runtime.GOOS+"/"+runtime.GOARCH+" · kb-create "+version)
	printRailErrorBlock(title, lines)
}

func printFatalDiagnostic(d *diag.Diag, version string) {
	if d == nil {
		printFatalError(errors.New("unknown error"), version)
		return
	}
	lines := []string{styleMuted.Render("Code: ") + styleWhite.Render(d.Code)}
	if reason := diagnosticReason(d); reason != "" {
		lines = append(lines, "", reason)
	}
	if d.Hint != "" {
		lines = append(lines, "", styleBold.Render("Next step:"), d.Hint)
	}
	lines = append(lines, "", "Runtime: "+runtime.GOOS+"/"+runtime.GOARCH+" · kb-create "+version)
	printRailErrorBlock(d.Message, lines)
}

func diagnosticReason(d *diag.Diag) string {
	if d == nil {
		return ""
	}
	var commandErr *pm.CommandError
	if !errors.As(d, &commandErr) {
		return d.Reason
	}
	parts := strings.Split(d.Reason, "\n")
	action := ""
	for _, part := range parts {
		if strings.HasPrefix(part, "action ") && strings.Contains(part, " failed") {
			action = part[:strings.Index(part, " failed")]
			break
		}
	}
	detail := packageManagerFailureDetail(pm.FailureSummary(commandErr))
	if action == "" {
		return detail
	}
	if detail == "" {
		return action + " failed"
	}
	return action + " failed\n" + detail
}

func packageManagerFailureDetail(output string) string {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	for i, line := range lines {
		if strings.Contains(line, "ERR_PNPM_") || strings.Contains(line, "npm ERR!") {
			end := i + 3
			if end > len(lines) {
				end = len(lines)
			}
			return strings.Join(lines[i:end], "\n")
		}
	}
	return ""
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
