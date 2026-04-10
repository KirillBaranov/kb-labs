package cmd

import (
	"testing"
)

func TestPad(t *testing.T) {
	tests := []struct {
		input string
		width int
		want  int
	}{
		{"hello", 10, 10},
		{"hi", 5, 5},
		{"longstring", 3, 10}, // doesn't truncate
	}
	for _, tt := range tests {
		got := Pad(tt.input, tt.width)
		if len(got) < tt.want {
			t.Errorf("Pad(%q, %d) = %q (len %d), want len >= %d", tt.input, tt.width, got, len(got), tt.want)
		}
	}
}

func TestColorEnabled(t *testing.T) {
	// In test context (piped stdout), colorEnabled should be false.
	if colorEnabled() {
		t.Skip("stdout is a tty in this environment")
	}
}

func TestNewOutput(t *testing.T) {
	// Smoke test — must not panic.
	out := newOutput()
	_ = out.StatusIcon("alive")
	_ = out.StatusIcon("dead")
	_ = out.StatusIcon("failed")
	_ = out.StatusIcon("starting")
	_ = out.StatusIcon("degraded")
	_ = out.StatusIcon("stopping")
	_ = out.StatusIcon("unknown")
	_ = out.StatusColor("alive")
	_ = out.StatusColor("dead")
}
