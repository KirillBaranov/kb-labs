package monitor

import (
	"strings"
	"testing"
)

// buildHealthOutput simulates what the remote shell produces for CheckHealthAll:
// for each container, one line ("true"/"false") then "---SEP---\n".
func buildHealthOutput(statuses []string) string {
	var sb strings.Builder
	for _, s := range statuses {
		sb.WriteString(s)
		sb.WriteString("\n")
		sb.WriteString(sep)
		sb.WriteString("\n")
	}
	return sb.String()
}

func TestParseHealthOutput_AllRunning(t *testing.T) {
	out := buildHealthOutput([]string{"true", "true"})
	got := parseHealthOutput(out, 2)
	want := []string{"running", "running"}
	assertSliceEqual(t, want, got)
}

func TestParseHealthOutput_AllStopped(t *testing.T) {
	out := buildHealthOutput([]string{"false", "false"})
	got := parseHealthOutput(out, 2)
	assertSliceEqual(t, []string{"stopped", "stopped"}, got)
}

func TestParseHealthOutput_Mixed(t *testing.T) {
	out := buildHealthOutput([]string{"true", "false", "true"})
	got := parseHealthOutput(out, 3)
	assertSliceEqual(t, []string{"running", "stopped", "running"}, got)
}

func TestParseHealthOutput_EmptyLineIsUnknown(t *testing.T) {
	// docker inspect fails → "false" printed by || echo false, but simulate
	// a truly empty segment (e.g. command produced no output before SEP).
	out := "\n" + sep + "\n"
	got := parseHealthOutput(out, 1)
	// "\n" trims to "" → unknown
	assertSliceEqual(t, []string{"unknown"}, got)
}

func TestParseHealthOutput_PartialOutput(t *testing.T) {
	// Only one segment returned but two containers expected.
	out := buildHealthOutput([]string{"true"})
	got := parseHealthOutput(out, 2)
	if got[0] != "running" {
		t.Errorf("got[0] = %q, want running", got[0])
	}
	if got[1] != "unknown" {
		t.Errorf("got[1] = %q, want unknown (missing segment)", got[1])
	}
}

func TestParseHealthOutput_Empty(t *testing.T) {
	got := parseHealthOutput("", 0)
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %v", got)
	}
}

func TestParseHealthOutput_SingleContainer(t *testing.T) {
	out := buildHealthOutput([]string{"false"})
	got := parseHealthOutput(out, 1)
	assertSliceEqual(t, []string{"stopped"}, got)
}

func assertSliceEqual(t *testing.T, want, got []string) {
	t.Helper()
	if len(want) != len(got) {
		t.Fatalf("len: want %d, got %d — want %v, got %v", len(want), len(got), want, got)
	}
	for i := range want {
		if want[i] != got[i] {
			t.Errorf("[%d]: want %q, got %q", i, want[i], got[i])
		}
	}
}
