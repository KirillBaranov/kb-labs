package cmd

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/kb-labs/clikit/diag"
	"github.com/kb-labs/create/internal/engine/executor"
	engineplan "github.com/kb-labs/create/internal/engine/plan"
	"github.com/kb-labs/create/internal/installer"
	"github.com/kb-labs/create/internal/manifest"
	"github.com/kb-labs/create/internal/pm"
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

func TestPrintCompletionBlockUsesOneSharedRail(t *testing.T) {
	got := captureStdout(t, func() {
		printCompletionBlock(&installer.Result{
			PlatformDir: "/platform",
			ProjectCWD:  "/project",
		}, &manifest.FirstCommand{
			Command:   "kb hello-world hello",
			Operation: manifest.CommandOperationAnalyze,
		}, "", "/project/.kb/plugins/hello-world", "hello-world", "/project/.kb/onboarding/agent-handoff.md", []string{
			"Skills             +6 added",
		}, []manifest.IntentDoc{{Label: "First Plugin guide", URL: "https://example.test/first-plugin"}}, []string{"kb-dev start", "pnpm kb --help"}, false, false)
	})
	for _, want := range []string{
		"KB Labs installed successfully",
		"◆ KB Labs is ready",
		"│ Installed",
		"│ Agent tools",
		"│ Next step",
		"│ Continue",
		"│ Configuration",
		"hello-world",
		"https://example.test/first-plugin",
		"Next steps:",
		"kb-dev start",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("completion block missing %q: %q", want, got)
		}
	}
}

func TestPrintFatalErrorUsesErrorRail(t *testing.T) {
	got := captureStdout(t, func() {
		printFatalError(errors.New("something broke"), "dev")
	})
	if !strings.Contains(got, "✗ Installation failed") {
		t.Fatalf("fatal error did not use the error rail: %q", got)
	}
	if !strings.Contains(got, "something broke") {
		t.Fatalf("fatal error omitted the error details: %q", got)
	}
}

func TestPrintSupportHintUsesLeftRailAndRecoveryLinks(t *testing.T) {
	got := captureStdout(t, func() { printSupportHint("/tmp/install.log") })
	for _, want := range []string{
		"What to do next",
		"No successful install state was recorded",
		"/tmp/install.log",
		"https://docs.kblabs.ru/en/guides/troubleshooting",
		"https://github.com/kb-labs-team/kb-labs/issues",
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

func TestPrintFatalErrorRendersPackageManagerTailOnce(t *testing.T) {
	commandErr := &pm.CommandError{Command: "pnpm add broken", Cause: errors.New("exit status 1"), Output: "ERR_PNPM_FETCH_404\nmissing package"}
	got := captureStdout(t, func() {
		printFatalError(fmt.Errorf("declarative installation failed: %w", commandErr), "dev")
	})
	if strings.Count(got, "ERR_PNPM_FETCH_404") != 1 || strings.Count(got, "missing package") != 1 {
		t.Fatalf("package-manager details must not be duplicated: %q", got)
	}
}

func TestPrintFatalDiagnosticIncludesPublicContract(t *testing.T) {
	got := captureStdout(t, func() {
		printFatalDiagnostic(diag.New("ERR_EXAMPLE", "Action failed", diag.WithReason("the concrete cause"), diag.WithHint("do the safe recovery")), "dev")
	})
	for _, want := range []string{"Action failed", "Code: ERR_EXAMPLE", "the concrete cause", "Next step:", "do the safe recovery"} {
		if !strings.Contains(got, want) {
			t.Errorf("diagnostic missing %q: %q", want, got)
		}
	}
}

func TestPrintFatalDiagnosticFiltersPackageManagerNoise(t *testing.T) {
	err := fmt.Errorf("action install:foundation failed: %w", &pm.CommandError{Command: "pnpm add noisy", Cause: errors.New("exit status 1"), Output: "[WARN] unrelated warning\nProgress: resolved 1\nERR_PNPM_NO_MATCHING_VERSION missing package\nThe requested version is not published\nOther releases are available"})
	got := captureStdout(t, func() { printFatalDiagnostic(classifyError(err), "dev") })
	for _, unwanted := range []string{"unrelated warning", "Progress: resolved", "pnpm add noisy"} {
		if strings.Contains(got, unwanted) {
			t.Errorf("human diagnostic leaked package-manager noise %q: %q", unwanted, got)
		}
	}
	for _, want := range []string{"ERR_PNPM_NO_MATCHING_VERSION", "The requested version is not published"} {
		if !strings.Contains(got, want) {
			t.Errorf("human diagnostic omitted actionable package failure %q: %q", want, got)
		}
	}
}

func TestRailPrefixesEachLineOfMultilineDetail(t *testing.T) {
	got := captureStdout(t, func() { printRailNotice("test", []string{"first\nsecond"}) })
	if !strings.Contains(got, "│ first\n│ second") {
		t.Errorf("multiline rail is not aligned: %q", got)
	}
}

func TestInstallationProgressReportsMilestonesOnly(t *testing.T) {
	var rendered strings.Builder
	compiled := engineplan.InstallPlan{Actions: []engineplan.PlanAction{
		{ID: "install:one", Kind: engineplan.ActionInstallPackage},
		{ID: "install:two", Kind: engineplan.ActionInstallPackage},
		{ID: "install:three", Kind: engineplan.ActionInstallPackage},
		{ID: "install:four", Kind: engineplan.ActionInstallPackage},
		{ID: "install:five", Kind: engineplan.ActionInstallPackage},
		{ID: "install:six", Kind: engineplan.ActionInstallPackage},
	}}
	report := installationProgress(&rendered, compiled)
	for _, id := range []string{"install:one", "install:two", "install:three", "install:four", "install:five", "install:six"} {
		report(executor.Event{ActionID: id, Status: executor.StatusApplying})
	}
	got := rendered.String()
	for _, want := range []string{"Installing packages 1/6", "Installing packages 5/6", "Installing packages 6/6"} {
		if !strings.Contains(got, want) {
			t.Errorf("milestone missing %q: %q", want, got)
		}
	}
	if strings.Contains(got, "2/6") || strings.Contains(got, "3/6") || strings.Contains(got, "4/6") {
		t.Errorf("intermediate package progress is noisy: %q", got)
	}
}

func TestRedactLogLineRemovesKnownCredentials(t *testing.T) {
	for _, test := range []struct{ input, want string }{
		{"NPM_TOKEN=secret", "NPM_TOKEN=[REDACTED]"},
		{"OPENAI_API_KEY: secret", "OPENAI_API_KEY=[REDACTED]"},
		{"fetch https://token@registry.example.test/pkg", "fetch https://[REDACTED]@registry.example.test/pkg"},
	} {
		if got := redactLogLine(test.input); got != test.want {
			t.Errorf("redactLogLine(%q) = %q, want %q", test.input, got, test.want)
		}
	}
}

func TestOnboardingNoticesUseSharedLeftRail(t *testing.T) {
	got := captureStdout(t, func() {
		printBootstrapAdminCredentials("admin@example.com", "secret")
	})

	for _, want := range []string{
		"Studio admin login",
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

func TestPrintDataConsentExplainsOpenAIOnlySetup(t *testing.T) {
	got := captureStdout(t, func() { printDataConsent(false, false) })
	if !strings.Contains(got, "OPENAI_API_KEY") {
		t.Fatalf("LLM-off status must explain how to enable OpenAI: %q", got)
	}
	for _, unwanted := range []string{"ANTHROPIC_API_KEY", "Enable LLM for a better experience"} {
		if strings.Contains(got, unwanted) {
			t.Errorf("LLM-off status must not advertise unsupported provider UI %q: %q", unwanted, got)
		}
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
