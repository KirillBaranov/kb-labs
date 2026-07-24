package cmd

import (
	"errors"
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
		}, "")
	})
	if !strings.Contains(got, "kb release plan") {
		t.Fatalf("handoff did not show first command: %q", got)
	}
	for _, unwanted := range []string{"kb review run", "kb commit commit", "kb --help"} {
		if strings.Contains(got, unwanted) {
			t.Errorf("handoff must not suggest unrelated command %q: %q", unwanted, got)
		}
	}
	if !strings.Contains(got, "http://127.0.0.1:3000") {
		t.Errorf("Studio handoff is missing its local URL: %q", got)
	}
	if !strings.Contains(got, "status and logs") || !strings.Contains(got, "next available action") {
		t.Errorf("Studio handoff does not explain what to use Studio for: %q", got)
	}
}

func TestPrintOutcomeHandoffRefusesMutatingFirstCommand(t *testing.T) {
	got := captureStdout(t, func() {
		printOutcomeHandoff(&installer.Result{}, &manifest.FirstCommand{
			Command:   "kb release publish",
			Operation: manifest.CommandOperationMutate,
		}, "")
	})
	if strings.Contains(got, "Run this next") || strings.Contains(got, "kb release publish") {
		t.Errorf("mutating command must not be offered in handoff: %q", got)
	}
}

func TestPrintOutcomeHandoffExplainsPendingInput(t *testing.T) {
	got := captureStdout(t, func() {
		printOutcomeHandoff(&installer.Result{}, &manifest.FirstCommand{
			Command:   "kb commit generate",
			Operation: manifest.CommandOperationAnalyze,
		}, "No changes found yet. Make a change first.")
	})
	if !strings.Contains(got, "Before you run it") || !strings.Contains(got, "No changes found yet") {
		t.Errorf("handoff did not explain pending input: %q", got)
	}
}

func TestPrintCustomPluginSummaryShowsPaths(t *testing.T) {
	got := captureStdout(t, func() {
		printCustomPluginSummary("/project/.kb/plugins/create-task", "create-task")
	})
	for _, want := range []string{"Your plugin", "manifest.ts", "Handler"} {
		if !strings.Contains(got, want) {
			t.Errorf("summary missing %q: %q", want, got)
		}
	}
}

func TestPrintSupportHintUsesLeftRailAndRecoveryLinks(t *testing.T) {
	got := captureStdout(t, printSupportHint)
	for _, want := range []string{
		"Thanks for taking the time",
		"helps us make KB Labs more reliable",
		"Please include the failure details above",
		"https://docs.kblabs.ru/en/guides/troubleshooting",
		"https://github.com/kb-labs-team/kb-labs/issues",
		"@kirill_baranov",
		"│",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("support hint missing %q: %q", want, got)
		}
	}
	for _, unwanted := range []string{"╭", "╰", "──"} {
		if strings.Contains(got, unwanted) {
			t.Errorf("support hint still renders a closed box %q: %q", unwanted, got)
		}
	}
}

func TestOnboardingNoticesUseSharedLeftRail(t *testing.T) {
	got := captureStdout(t, func() {
		printLLMRecommendation()
		printBootstrapAdminCredentials("admin@example.com", "secret")
	})

	for _, want := range []string{
		"Enable LLM for a better experience",
		"Studio admin login",
		"AI commit messages",
		"Email",
		"│",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("notice missing %q: %q", want, got)
		}
	}
	for _, unwanted := range []string{"╭", "╰", "──", "\n  │"} {
		if strings.Contains(got, unwanted) {
			t.Errorf("notice must use a flush-left left rail, found %q: %q", unwanted, got)
		}
	}
}

func TestSpinnerLineStartsAtLeftEdge(t *testing.T) {
	got := spinnerLine("⠹", "[2/4] Installing 1 binary", "│ Putting the platform together")
	if !strings.HasPrefix(got, "\r\x1b[K⠹") {
		t.Errorf("spinner line has unexpected indentation: %q", got)
	}
}

func TestPrintFatalErrorPreservesDetailsAndSafeRuntimeContext(t *testing.T) {
	got := captureStdout(t, func() {
		printFatalError(errors.New("install: ERR_PNPM_NO_MATCHING_VERSION\nmissing package"), "2.106.0")
	})
	for _, want := range []string{"ERR_PNPM_NO_MATCHING_VERSION", "missing package", "Runtime:", "kb-create 2.106.0"} {
		if !strings.Contains(got, want) {
			t.Errorf("fatal error output missing %q: %q", want, got)
		}
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
