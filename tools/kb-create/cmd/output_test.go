package cmd

import (
	"io"
	"os"
	"strings"
	"testing"
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
