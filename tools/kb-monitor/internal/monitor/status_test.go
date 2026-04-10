package monitor

import (
	"strings"
	"testing"
)

// buildStatusOutput simulates the remote shell output for FetchStatusAll.
// Each entry is "running@startedAt@imageSHA" then "---SEP---\n".
func buildStatusOutput(lines []string) string {
	var sb strings.Builder
	for _, l := range lines {
		sb.WriteString(l)
		sb.WriteString("\n")
		sb.WriteString(sep)
		sb.WriteString("\n")
	}
	return sb.String()
}

func TestParseStatusOutput_Running(t *testing.T) {
	out := buildStatusOutput([]string{
		"true@2026-04-10T12:00:00Z@sha256:abc123",
	})
	containers := []string{"web"}
	got := parseStatusOutput(out, containers)

	if len(got) != 1 {
		t.Fatalf("expected 1 result, got %d", len(got))
	}
	r := got[0]
	if r.Service != "web" {
		t.Errorf("Service = %q, want web", r.Service)
	}
	if !r.Running {
		t.Errorf("Running = false, want true")
	}
	if r.Health != "running" {
		t.Errorf("Health = %q, want running", r.Health)
	}
	if r.StartedAt != "2026-04-10T12:00:00Z" {
		t.Errorf("StartedAt = %q, want 2026-04-10T12:00:00Z", r.StartedAt)
	}
	if r.ImageSHA != "sha256:abc123" {
		t.Errorf("ImageSHA = %q, want sha256:abc123", r.ImageSHA)
	}
}

func TestParseStatusOutput_Stopped(t *testing.T) {
	// docker inspect returns "false@@" when container is stopped (our fallback).
	out := buildStatusOutput([]string{"false@@"})
	got := parseStatusOutput(out, []string{"api"})

	r := got[0]
	if r.Running {
		t.Errorf("Running = true, want false")
	}
	if r.Health != "stopped" {
		t.Errorf("Health = %q, want stopped", r.Health)
	}
	if r.StartedAt != "" {
		t.Errorf("StartedAt = %q, want empty", r.StartedAt)
	}
}

func TestParseStatusOutput_Multiple(t *testing.T) {
	out := buildStatusOutput([]string{
		"true@2026-04-10T10:00:00Z@sha256:111",
		"false@@",
		"true@2026-04-10T11:00:00Z@sha256:222",
	})
	containers := []string{"web", "worker", "scheduler"}
	got := parseStatusOutput(out, containers)

	if len(got) != 3 {
		t.Fatalf("expected 3, got %d", len(got))
	}
	if !got[0].Running || got[0].Health != "running" {
		t.Errorf("got[0]: want running, got %+v", got[0])
	}
	if got[1].Running || got[1].Health != "stopped" {
		t.Errorf("got[1]: want stopped, got %+v", got[1])
	}
	if !got[2].Running || got[2].ImageSHA != "sha256:222" {
		t.Errorf("got[2]: want running+sha256:222, got %+v", got[2])
	}
}

func TestParseStatusOutput_MissingSegment(t *testing.T) {
	// Only 1 segment but 2 containers.
	out := buildStatusOutput([]string{"true@2026-04-10T12:00:00Z@sha256:abc"})
	got := parseStatusOutput(out, []string{"web", "docs"})

	if len(got) != 2 {
		t.Fatalf("expected 2, got %d", len(got))
	}
	if got[0].Health != "running" {
		t.Errorf("got[0].Health = %q, want running", got[0].Health)
	}
	if got[1].Health != "unknown" {
		t.Errorf("got[1].Health = %q, want unknown (missing segment)", got[1].Health)
	}
}

func TestParseStatusOutput_MalformedLine(t *testing.T) {
	// Only one field — not enough @ separators.
	out := buildStatusOutput([]string{"garbage"})
	got := parseStatusOutput(out, []string{"web"})

	if got[0].Health != "unknown" {
		t.Errorf("Health = %q, want unknown for malformed line", got[0].Health)
	}
}

func TestParseStatusOutput_ServiceNamePreserved(t *testing.T) {
	out := buildStatusOutput([]string{"false@@"})
	got := parseStatusOutput(out, []string{"kb-labs-web"})

	if got[0].Service != "kb-labs-web" {
		t.Errorf("Service = %q, want kb-labs-web", got[0].Service)
	}
}

func TestParseStatusOutput_Empty(t *testing.T) {
	got := parseStatusOutput("", []string{})
	if len(got) != 0 {
		t.Errorf("expected empty, got %v", got)
	}
}
