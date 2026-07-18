package platform

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestWriteCLIWrapper_Fresh verifies that writing into an empty binDir
// reports a fresh install with no previous target.
func TestWriteCLIWrapper_Fresh(t *testing.T) {
	binDir := t.TempDir()
	binJS := "/opt/kb/first/bin.js"

	res, err := WriteCLIWrapper(binDir, binJS)
	if err != nil {
		t.Fatalf("WriteCLIWrapper: %v", err)
	}
	if res.Replaced {
		t.Error("fresh install should not report Replaced=true")
	}
	if res.PreviousTarget != "" {
		t.Errorf("fresh install PreviousTarget = %q, want empty", res.PreviousTarget)
	}
	if !strings.Contains(res.Path, wrapperName()) {
		t.Errorf("Path = %q, want to contain %q", res.Path, wrapperName())
	}
}

// TestWriteCLIWrapper_Idempotent verifies that writing twice with the same
// target reports PreviousTarget but does NOT set Replaced (it's a no-op
// from the user's perspective).
func TestWriteCLIWrapper_Idempotent(t *testing.T) {
	binDir := t.TempDir()
	binJS := "/opt/kb/same/bin.js"

	if _, err := WriteCLIWrapper(binDir, binJS); err != nil {
		t.Fatalf("first write: %v", err)
	}
	res, err := WriteCLIWrapper(binDir, binJS)
	if err != nil {
		t.Fatalf("second write: %v", err)
	}
	if res.Replaced {
		t.Error("same-target write must not set Replaced=true")
	}
	if res.PreviousTarget != binJS {
		t.Errorf("PreviousTarget = %q, want %q", res.PreviousTarget, binJS)
	}
}

// TestWriteCLIWrapper_Overwrite is the critical case: a prior install
// pointed at a different binJS path. Must be reported loudly.
func TestWriteCLIWrapper_Overwrite(t *testing.T) {
	binDir := t.TempDir()
	oldBinJS := "/opt/kb/old/bin.js"
	newBinJS := "/opt/kb/new/bin.js"

	if _, err := WriteCLIWrapper(binDir, oldBinJS); err != nil {
		t.Fatalf("first write: %v", err)
	}
	res, err := WriteCLIWrapper(binDir, newBinJS)
	if err != nil {
		t.Fatalf("second write: %v", err)
	}
	if !res.Replaced {
		t.Error("overwriting a different target must set Replaced=true")
	}
	if res.PreviousTarget != oldBinJS {
		t.Errorf("PreviousTarget = %q, want %q", res.PreviousTarget, oldBinJS)
	}
}

// TestWriteCLIWrapper_OverwriteOpaque checks that when an unrelated file
// is already at the destination (e.g. user's own kb wrapper from a
// different tool), we flag Replaced=true and label it as opaque so the
// install log still warns.
func TestWriteCLIWrapper_OverwriteOpaque(t *testing.T) {
	binDir := t.TempDir()
	dst := filepath.Join(binDir, wrapperName())
	if err := os.WriteFile(dst, []byte("#!/bin/sh\necho hi\n"), 0o755); err != nil { // #nosec G306 -- test file
		t.Fatalf("seed opaque file: %v", err)
	}

	res, err := WriteCLIWrapper(binDir, "/opt/kb/fresh/bin.js")
	if err != nil {
		t.Fatalf("WriteCLIWrapper: %v", err)
	}
	if !res.Replaced {
		t.Error("overwriting an opaque file must set Replaced=true")
	}
	if res.PreviousTarget != "(opaque file)" {
		t.Errorf("PreviousTarget = %q, want \"(opaque file)\"", res.PreviousTarget)
	}
}

// TestCopyBinary_Fresh mirrors the WriteCLIWrapper fresh-install test
// for the binary install path.
func TestCopyBinary_Fresh(t *testing.T) {
	binDir := t.TempDir()
	srcDir := t.TempDir()
	src := filepath.Join(srcDir, "kb-dev")
	if err := os.WriteFile(src, []byte("stub"), 0o755); err != nil { // #nosec G306 -- test binary
		t.Fatalf("write src: %v", err)
	}

	res, err := CopyBinary(src, binDir, "kb-dev")
	if err != nil {
		t.Fatalf("CopyBinary: %v", err)
	}
	if res.Replaced {
		t.Error("fresh install must not set Replaced=true")
	}
	if res.PreviousTarget != "" {
		t.Errorf("PreviousTarget = %q, want empty", res.PreviousTarget)
	}
}

// TestCopyBinary_ReplacedSymlink verifies the critical case that we
// discovered in the live user walkthrough: a pre-existing symlink in
// ~/.local/bin pointing at a *different* platform must be reported as
// Replaced so the installer can warn the user.
func TestCopyBinary_ReplacedSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink semantics differ on Windows")
	}
	binDir := t.TempDir()

	// Pre-existing symlink pointing at a fake old platform install.
	oldTarget := "/opt/kb-old/bin/kb-dev"
	dst := filepath.Join(binDir, "kb-dev")
	if err := os.Symlink(oldTarget, dst); err != nil {
		t.Fatalf("seed symlink: %v", err)
	}

	// New install with a different source path.
	srcDir := t.TempDir()
	newSrc := filepath.Join(srcDir, "kb-dev")
	if err := os.WriteFile(newSrc, []byte("stub"), 0o755); err != nil { // #nosec G306
		t.Fatalf("write new src: %v", err)
	}

	res, err := CopyBinary(newSrc, binDir, "kb-dev")
	if err != nil {
		t.Fatalf("CopyBinary: %v", err)
	}
	if !res.Replaced {
		t.Error("overwriting a symlink to a different target must set Replaced=true")
	}
	if res.PreviousTarget != oldTarget {
		t.Errorf("PreviousTarget = %q, want %q", res.PreviousTarget, oldTarget)
	}
}

// TestCopyBinary_SameSymlink verifies the idempotent case: re-running
// the installer should not flag Replaced when the symlink already points
// at the same source path.
func TestCopyBinary_SameSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink semantics differ on Windows")
	}
	binDir := t.TempDir()
	srcDir := t.TempDir()
	src := filepath.Join(srcDir, "kb-dev")
	if err := os.WriteFile(src, []byte("stub"), 0o755); err != nil { // #nosec G306
		t.Fatalf("write src: %v", err)
	}

	// First install.
	if _, err := CopyBinary(src, binDir, "kb-dev"); err != nil {
		t.Fatalf("first install: %v", err)
	}
	// Second install with the same source path.
	res, err := CopyBinary(src, binDir, "kb-dev")
	if err != nil {
		t.Fatalf("second install: %v", err)
	}
	if res.Replaced {
		t.Error("re-installing the same symlink must not set Replaced=true")
	}
	if res.PreviousTarget != src {
		t.Errorf("PreviousTarget = %q, want %q", res.PreviousTarget, src)
	}
}

// ── EnsureInPATH (installation-flow.md "M1: Warn: shell restart needed") ────

// TestEnsureInPATH_NotInPATH_NeedsRestart verifies the soft-warning contract:
// when binDir isn't already on PATH, EnsureInPATH must append an export line
// to the shell rc file and report NeedRestart with a non-empty hint — never
// an error, since PATH setup is a soft-fail path (installer.go continues
// regardless of this outcome).
func TestEnsureInPATH_NotInPATH_NeedsRestart(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("this platform ships only Linux/macOS install support")
	}

	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("SHELL", "/bin/zsh")
	// Deliberately exclude binDir from PATH.
	t.Setenv("PATH", "/usr/bin:/bin")

	binDir := filepath.Join(t.TempDir(), "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatalf("mkdir binDir: %v", err)
	}

	res := EnsureInPATH(binDir)

	if res.AlreadySet {
		t.Fatal("AlreadySet = true, want false — binDir was deliberately excluded from PATH")
	}
	if !res.NeedRestart {
		t.Error("NeedRestart = false, want true when binDir isn't on PATH")
	}
	if res.HintCmd == "" {
		t.Error("HintCmd is empty, want a shell hint the user can run")
	}

	rc := filepath.Join(home, ".zshrc")
	data, err := os.ReadFile(rc) // #nosec G304 -- rc path built from t.TempDir() HOME
	if err != nil {
		t.Fatalf("expected .zshrc to be written: %v", err)
	}
	if !strings.Contains(string(data), binDir) {
		t.Errorf(".zshrc does not reference binDir %q:\n%s", binDir, data)
	}
}

// TestEnsureInPATH_AlreadyInPATH verifies the no-op path: when binDir is
// already on PATH, EnsureInPATH must not touch any rc file and must report
// AlreadySet without a restart hint.
func TestEnsureInPATH_AlreadyInPATH(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("this platform ships only Linux/macOS install support")
	}

	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("SHELL", "/bin/zsh")

	binDir := filepath.Join(t.TempDir(), "bin")
	t.Setenv("PATH", binDir+string(os.PathListSeparator)+"/usr/bin")

	res := EnsureInPATH(binDir)

	if !res.AlreadySet {
		t.Error("AlreadySet = false, want true — binDir is already on PATH")
	}
	if res.NeedRestart {
		t.Error("NeedRestart = true, want false when nothing needed to change")
	}
	if _, err := os.Stat(filepath.Join(home, ".zshrc")); err == nil {
		t.Error(".zshrc was created even though PATH already contained binDir")
	}
}

// wrapperName returns the OS-specific wrapper filename used by
// WriteCLIWrapper (`kb` on Unix, `kb.cmd` on Windows).
func wrapperName() string {
	if runtime.GOOS == "windows" {
		return "kb.cmd"
	}
	return "kb"
}
