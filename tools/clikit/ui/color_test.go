package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
)

func TestColorEnabled_NoColorEnv(t *testing.T) {
	t.Setenv("NO_COLOR", "1")
	// Even a real char device would be disabled; a temp file suffices to assert
	// the env short-circuit returns false before the device check.
	if ColorEnabled(os.Stdout) {
		t.Error("NO_COLOR must disable color")
	}
}

func TestColorEnabled_TermDumb(t *testing.T) {
	t.Setenv("NO_COLOR", "")
	t.Setenv("TERM", "dumb")
	if ColorEnabled(os.Stdout) {
		t.Error("TERM=dumb must disable color")
	}
}

func TestColorEnabled_RegularFileIsNotATerminal(t *testing.T) {
	t.Setenv("NO_COLOR", "")
	t.Setenv("TERM", "xterm-256color")
	f, err := os.Create(filepath.Join(t.TempDir(), "out.log"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if ColorEnabled(f) {
		t.Error("a regular file is not a char device — color must be off")
	}
}

func TestColorEnabled_NonFileWriter(t *testing.T) {
	t.Setenv("NO_COLOR", "")
	t.Setenv("TERM", "xterm-256color")
	if ColorEnabled(&strings.Builder{}) {
		t.Error("a non-*os.File writer must not enable color")
	}
}

// color() maps the enabled flag onto a concrete lipgloss color type.
func TestColor_DisabledYieldsNoColor(t *testing.T) {
	if _, ok := color(false, "10").(lipgloss.NoColor); !ok {
		t.Errorf("color(false) = %T, want lipgloss.NoColor", color(false, "10"))
	}
}

func TestColor_EnabledYieldsConcreteColor(t *testing.T) {
	c, ok := color(true, "10").(lipgloss.Color)
	if !ok {
		t.Fatalf("color(true) = %T, want lipgloss.Color", color(true, "10"))
	}
	if string(c) != "10" {
		t.Errorf("color value = %q, want %q", string(c), "10")
	}
}
