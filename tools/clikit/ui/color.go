package ui

import (
	"io"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// ColorEnabled reports whether ANSI color should be used when writing to w.
// Honors NO_COLOR and TERM=dumb, and requires w to be a character device
// (a real terminal). Non-*os.File writers (buffers, pipes) get no color, which
// keeps golden tests deterministic.
func ColorEnabled(w io.Writer) bool {
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	if strings.EqualFold(os.Getenv("TERM"), "dumb") {
		return false
	}
	f, ok := w.(*os.File)
	if !ok {
		return false
	}
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}

func color(enabled bool, ansi string) lipgloss.TerminalColor {
	if !enabled {
		return lipgloss.NoColor{}
	}
	return lipgloss.Color(ansi)
}
