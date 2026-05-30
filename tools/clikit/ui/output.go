// Package ui is the shared lipgloss-based pretty-printer for the KB Labs Go
// launcher tools — the single source for the [INFO]/[ OK ]/[WARN]/[ERR ] tags,
// sections, key-values and bullets that were previously copy-pasted into each
// tool's cmd/output.go.
package ui

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/charmbracelet/lipgloss"
)

// Output renders styled lines to a writer. Construct with New or NewStdout.
type Output struct {
	w io.Writer

	infoTag string
	okTag   string
	warnTag string
	errTag  string
	label   lipgloss.Style
	value   lipgloss.Style
	dim     lipgloss.Style
	bullet  lipgloss.Style
}

// New builds an Output writing to w; color is auto-detected for w.
func New(w io.Writer) Output {
	enabled := ColorEnabled(w)
	return Output{
		w:       w,
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

// NewStdout builds an Output writing to os.Stdout.
func NewStdout() Output { return New(os.Stdout) }

// NewStderr builds an Output writing to os.Stderr (for human progress that
// should not pollute a machine-readable stdout).
func NewStderr() Output { return New(os.Stderr) }

func (o Output) Info(msg string) { fmt.Fprintf(o.w, "%s %s\n", o.infoTag, msg) }
func (o Output) OK(msg string)   { fmt.Fprintf(o.w, "%s %s\n", o.okTag, msg) }
func (o Output) Warn(msg string) { fmt.Fprintf(o.w, "%s %s\n", o.warnTag, msg) }
func (o Output) Err(msg string)  { fmt.Fprintf(o.w, "%s %s\n", o.errTag, msg) }

// Section prints a titled section header.
func (o Output) Section(title string) {
	fmt.Fprintf(o.w, "\n%s %s\n", o.infoTag, o.label.Render(title))
}

// KeyValue prints an indented "key: value" line.
func (o Output) KeyValue(k, v string) {
	fmt.Fprintf(o.w, "  %s %s\n", o.label.Render(k+":"), o.value.Render(v))
}

// Bullet prints an indented bullet, optionally with dimmed trailing details.
func (o Output) Bullet(label, details string) {
	if details == "" {
		fmt.Fprintf(o.w, "    %s %s\n", o.bullet.Render("●"), label)
		return
	}
	fmt.Fprintf(o.w, "    %s %-30s  %s\n", o.bullet.Render("●"), label, o.dim.Render(details))
}

// Detail prints a dimmed diagnostic line indented under an entry.
func (o Output) Detail(msg string) {
	fmt.Fprintf(o.w, "    %s\n", o.dim.Render("↳ "+msg))
}

// Raw writes a plain line to the underlying writer (no styling).
func (o Output) Raw(msg string) { fmt.Fprintln(o.w, msg) }

// Pad pads s to the given width.
func Pad(s string, width int) string { return fmt.Sprintf("%-*s", width, s) }

// JSONOut writes v as indented JSON to stdout.
func JSONOut(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

// JSONLOut writes v as a single JSONL line to stdout.
func JSONLOut(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = fmt.Println(string(b))
	return err
}
