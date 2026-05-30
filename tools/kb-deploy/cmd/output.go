package cmd

import (
	"os"

	"github.com/kb-labs/clikit/ui"
)

// Output formatting is provided by the shared clikit/ui package; these thin
// wrappers keep the existing call sites (newOutput, JSONOut, …) unchanged.

// newOutput returns a stdout-bound styled printer.
func newOutput() ui.Output { return ui.NewStdout() }

// JSONOut writes v as indented JSON to stdout.
func JSONOut(v any) error { return ui.JSONOut(v) }

// JSONLOut writes v as a single JSONL line to stdout.
func JSONLOut(v any) error { return ui.JSONLOut(v) }

// Pad pads s to width.
func Pad(s string, width int) string { return ui.Pad(s, width) }

// colorEnabled reports whether stdout supports color (used by tests).
func colorEnabled() bool { return ui.ColorEnabled(os.Stdout) }
