package cmd

import (
	"io"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/kb-labs/create/internal/installer"
)

func TestColorEnabled_DisabledByNoColor(t *testing.T) {
	prev := os.Getenv("NO_COLOR")
	t.Cleanup(func() {
		if prev == "" {
			_ = os.Unsetenv("NO_COLOR")
			return
		}
		_ = os.Setenv("NO_COLOR", prev)
	})
	_ = os.Setenv("NO_COLOR", "1")
	if colorEnabled() {
		t.Fatal("colorEnabled() = true, want false when NO_COLOR is set")
	}
}

func TestColorEnabled_DisabledByDumbTerm(t *testing.T) {
	prevNoColor := os.Getenv("NO_COLOR")
	prevTerm := os.Getenv("TERM")
	t.Cleanup(func() {
		if prevNoColor == "" {
			_ = os.Unsetenv("NO_COLOR")
		} else {
			_ = os.Setenv("NO_COLOR", prevNoColor)
		}
		if prevTerm == "" {
			_ = os.Unsetenv("TERM")
		} else {
			_ = os.Setenv("TERM", prevTerm)
		}
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
		if prevNoColor == "" {
			_ = os.Unsetenv("NO_COLOR")
		} else {
			_ = os.Setenv("NO_COLOR", prevNoColor)
		}
		if prevTerm == "" {
			_ = os.Unsetenv("TERM")
		} else {
			_ = os.Setenv("TERM", prevTerm)
		}
	})

	_ = os.Setenv("NO_COLOR", "1")
	_ = os.Setenv("TERM", "dumb")

	out := newOutput()
	got := captureStdout(t, func() {
		out.Info("hello")
		out.OK("done")
	})

	if !strings.Contains(got, "[INFO] hello") {
		t.Fatalf("expected INFO line, got: %q", got)
	}
	if !strings.Contains(got, "[ OK ] done") {
		t.Fatalf("expected OK line, got: %q", got)
	}
	if strings.Contains(got, "\x1b[") {
		t.Fatalf("unexpected ANSI escapes in no-color mode: %q", got)
	}
}

// ── buildNextSteps ────────────────────────────────────────────────────────────

func TestBuildNextSteps_NoBinariesNoServices(t *testing.T) {
	r := &installer.Result{ProjectCWD: "/proj"}
	steps := buildNextSteps(r, false)

	for _, s := range steps {
		if strings.Contains(s.cmd, "kb-dev") {
			t.Errorf("kb-dev step must not appear when no binaries installed, got: %q", s.cmd)
		}
	}
	if steps[0].cmd != "cd /proj" {
		t.Errorf("first step must be cd, got %q", steps[0].cmd)
	}
}

func TestBuildNextSteps_KbDevShownWhenInstalledAndServicesPresent(t *testing.T) {
	r := &installer.Result{
		ProjectCWD:        "/proj",
		InstalledBinaries: []string{"kb-dev"},
		HasServices:       true,
	}
	steps := buildNextSteps(r, false)

	found := false
	for _, s := range steps {
		if s.cmd == "kb-dev start" {
			found = true
		}
	}
	if !found {
		t.Error("kb-dev start must appear when kb-dev is installed and services are present")
	}
}

func TestBuildNextSteps_KbDevHiddenWhenInstalledButNoServices(t *testing.T) {
	r := &installer.Result{
		ProjectCWD:        "/proj",
		InstalledBinaries: []string{"kb-dev"},
		HasServices:       false,
	}
	steps := buildNextSteps(r, false)

	for _, s := range steps {
		if strings.Contains(s.cmd, "kb-dev") {
			t.Errorf("kb-dev step must not appear when no services in manifest, got: %q", s.cmd)
		}
	}
}

func TestBuildNextSteps_AlwaysEndsWithHelp(t *testing.T) {
	for _, r := range []*installer.Result{
		{ProjectCWD: t.TempDir()},
		{ProjectCWD: t.TempDir(), InstalledBinaries: []string{"kb-dev"}, HasServices: true},
	} {
		if err := exec.Command("git", "init", "-q", r.ProjectCWD).Run(); err != nil {
			t.Fatalf("git init: %v", err)
		}

		steps := buildNextSteps(r, false)
		cmds := make([]string, len(steps))
		for i, s := range steps {
			cmds[i] = s.cmd
		}

		// review and commit must appear once there's a git repo to look at
		mustContain := []string{"kb review run", "kb commit commit", "kb --help"}
		for _, must := range mustContain {
			found := false
			for _, c := range cmds {
				if c == must {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("%q must appear in next steps for a git repo (all: %v)", must, cmds)
			}
		}
	}
}

// TestBuildNextSteps_SuggestsGitInitBeforeReviewOrCommit verifies that on a
// brand-new project with no git repo yet, kb-create suggests `git init`
// instead of `kb review run` / `kb commit commit` — both of which fail
// immediately with "fatal: not a git repository" otherwise.
func TestBuildNextSteps_SuggestsGitInitBeforeReviewOrCommit(t *testing.T) {
	r := &installer.Result{ProjectCWD: t.TempDir()} // no `git init` — not a repo

	steps := buildNextSteps(r, false)
	cmds := make([]string, len(steps))
	for i, s := range steps {
		cmds[i] = s.cmd
	}

	for _, mustNotAppear := range []string{"kb review run", "kb commit commit"} {
		for _, c := range cmds {
			if c == mustNotAppear {
				t.Errorf("%q should not be suggested before a git repo exists (all: %v)", mustNotAppear, cmds)
			}
		}
	}

	found := false
	for _, c := range cmds {
		if c == "git init" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("\"git init\" should be suggested when there's no git repo yet (all: %v)", cmds)
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
