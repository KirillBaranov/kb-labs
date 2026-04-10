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

// ── next steps ────────────────────────────────────────────────────────────────

func printNextSteps(r *installer.Result) {
	fmt.Println(styleDivider)
	fmt.Println()
	fmt.Println("  " + styleBold.Render("What's next"))
	fmt.Println()

	arrow := styleAccent.Render("→")
	cmd := func(c, desc string) {
		fmt.Printf("  %s  %-26s%s\n", arrow, styleWhite.Render(c), styleMuted.Render(desc))
	}

	cmd("cd "+r.ProjectCWD, "")
	cmd("kb-dev start", "start all services")
	cmd("kb --help", "explore commands")
	cmd("kb-create doctor", "check environment")
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
