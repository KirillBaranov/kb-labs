package cmd

import (
	"io"
	"os"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/manifest"
)

func TestColorEnabled_DisabledByNoColor(t *testing.T) {
	prev := os.Getenv("NO_COLOR")
	t.Cleanup(func() { _ = os.Setenv("NO_COLOR", prev) })
	_ = os.Setenv("NO_COLOR", "1")
	if colorEnabled() {
		t.Fatal("colorEnabled() = true, want false when NO_COLOR is set")
	}
}

func TestColorEnabled_DisabledByDumbTerm(t *testing.T) {
	prevNoColor := os.Getenv("NO_COLOR")
	prevTerm := os.Getenv("TERM")
	t.Cleanup(func() {
		_ = os.Setenv("NO_COLOR", prevNoColor)
		_ = os.Setenv("TERM", prevTerm)
	})
	_ = os.Unsetenv("NO_COLOR")
	_ = os.Setenv("TERM", "dumb")
	if colorEnabled() {
		t.Fatal("colorEnabled() = true, want false when TERM=dumb")
	}
}

func TestOutputInfo_NoColorPrefix(t *testing.T) {
	prevNoColor := os.Getenv("NO_COLOR")
	prevTerm := os.Getenv("TERM")
	t.Cleanup(func() {
		_ = os.Setenv("NO_COLOR", prevNoColor)
		_ = os.Setenv("TERM", prevTerm)
	})
	_ = os.Setenv("NO_COLOR", "1")
	_ = os.Setenv("TERM", "dumb")

	got := captureStdout(t, func() {
		out := newOutput()
		out.Info("hello")
		out.OK("done")
	})
	if !strings.Contains(got, "[INFO] hello") || !strings.Contains(got, "[ OK ] done") {
		t.Fatalf("expected output tags, got: %q", got)
	}
	if strings.Contains(got, "\x1b[") {
		t.Fatalf("unexpected ANSI escapes in no-color mode: %q", got)
	}
}

func TestPrintOutcomeHandoffShowsOnlySelectedSafeCommand(t *testing.T) {
	got := captureStdout(t, func() {
		printOutcomeHandoff(&installer.Result{}, &manifest.FirstCommand{
			Command:     "kb release plan",
			Description: "Prepare a release plan without publishing packages.",
			Operation:   manifest.CommandOperationAnalyze,
			Studio:      true,
		})
	})
	if !strings.Contains(got, "kb release plan") {
		t.Fatalf("handoff did not show first command: %q", got)
	}
	for _, unwanted := range []string{"kb review run", "kb commit commit", "kb-dev start", "kb --help"} {
		if strings.Contains(got, unwanted) {
			t.Errorf("handoff must not suggest unrelated command %q: %q", unwanted, got)
		}
	}
}

func TestPrintOutcomeHandoffRefusesMutatingFirstCommand(t *testing.T) {
	got := captureStdout(t, func() {
		printOutcomeHandoff(&installer.Result{}, &manifest.FirstCommand{
			Command:   "kb release publish",
			Operation: manifest.CommandOperationMutate,
		})
	})
	if strings.Contains(got, "Run this next") || strings.Contains(got, "kb release publish") {
		t.Errorf("mutating command must not be offered in handoff: %q", got)
	}
}

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe() error = %v", err)
	}
	os.Stdout = w
	defer func() { os.Stdout = old }()

	fn()
	_ = w.Close()
	data, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("io.ReadAll() error = %v", err)
	}
	_ = r.Close()
	return string(data)
}
