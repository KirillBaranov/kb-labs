package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// output provides unified CLI formatting with lipgloss.
type output struct {
	infoTag string
	okTag   string
	warnTag string
	errTag  string
	label   lipgloss.Style
	value   lipgloss.Style
	dim     lipgloss.Style
	bullet  lipgloss.Style

	// Issue severity styles.
	healthy lipgloss.Style
	warning lipgloss.Style
	errStyle lipgloss.Style
	info    lipgloss.Style
}

func newOutput() output {
	enabled := colorEnabled()
	return output{
		infoTag:  lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "14")).Render("[INFO]"),
		okTag:    lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "10")).Render("[ OK ]"),
		warnTag:  lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "11")).Render("[WARN]"),
		errTag:   lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "9")).Render("[ERR ]"),
		label:    lipgloss.NewStyle().Bold(true).Foreground(color(enabled, "8")),
		value:    lipgloss.NewStyle().Foreground(color(enabled, "14")),
		dim:      lipgloss.NewStyle().Foreground(color(enabled, "8")),
		bullet:   lipgloss.NewStyle().Foreground(color(enabled, "10")),

		healthy:  lipgloss.NewStyle().Foreground(color(enabled, "10")),
		warning:  lipgloss.NewStyle().Foreground(color(enabled, "11")),
		errStyle: lipgloss.NewStyle().Foreground(color(enabled, "9")),
		info:     lipgloss.NewStyle().Foreground(color(enabled, "14")),
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
	fmt.Printf("    %s %-30s  %s\n", o.bullet.Render("●"), label, o.dim.Render(details))
}

// StatusIcon returns the colored icon for a package/workspace health state.
func (o output) StatusIcon(state string) string {
	switch state {
	case "healthy":
		return o.healthy.Render("●")
	case "warning":
		return o.warning.Render("◐")
	case "error":
		return o.errStyle.Render("✕")
	default: // unknown / skipped
		return o.dim.Render("○")
	}
}

// SeverityColor returns colored severity label.
func (o output) SeverityColor(severity string) string {
	switch severity {
	case "error":
		return o.errStyle.Render("error")
	case "warning":
		return o.warning.Render("warning")
	default:
		return o.info.Render(severity)
	}
}

// Detail prints a diagnostic line indented under a package.
func (o output) Detail(msg string) {
	fmt.Printf("    %s\n", o.dim.Render("↳ "+msg))
}

// Pad pads a string to the given width.
func Pad(s string, width int) string {
	return fmt.Sprintf("%-*s", width, s)
}

// JSONOut writes a value as JSON to stdout.
func JSONOut(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

// JSONLOut writes a single JSONL line to stdout (for watch/gate streaming).
func JSONLOut(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = fmt.Println(string(b))
	return err
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
